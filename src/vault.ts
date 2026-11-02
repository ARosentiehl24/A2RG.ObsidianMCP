import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpVaultPort } from "./ports.js";
import { PersistentSearchCache } from "./persistent-search-cache.js";
import {
  extractMatchingLines,
  normalizeSearchText,
  TextSearchIndex,
} from "./search-index.js";
import { VaultPathResolver } from "./vault-path-resolver.js";

export interface FileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: Date;
}

export class VaultManager implements McpVaultPort {
  private readonly vaultPath: string;
  private readonly pathResolver: VaultPathResolver;
  private readonly searchIndex = new TextSearchIndex();
  private readonly searchCache: PersistentSearchCache;
  private searchIndexReady = false;
  private searchIndexPromise: Promise<void> | null = null;
  private searchCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.pathResolver = new VaultPathResolver(vaultPath);
    this.searchCache = new PersistentSearchCache(
      path.join(
        vaultPath,
        ".obsidian",
        "plugins",
        "mcp-vault-connector",
        "cache",
        "search-index-v1.json",
      ),
    );
  }

  private resolvePath(relativePath: string, allowRoot = false): Promise<string> {
    return this.pathResolver.resolve(relativePath, allowRoot);
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = await this.resolvePath(relativePath);
    return this.readFileNoFollow(fullPath);
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = await this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const handle = await fs.open(
      fullPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_TRUNC
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.chmod(0o600);
      await handle.writeFile(content, "utf-8");
    } finally {
      await handle.close();
    }
    await this.updateSearchDocument(relativePath, content);
    this.scheduleSearchCacheSave();
  }

  async appendFile(relativePath: string, content: string): Promise<void> {
    const fullPath = await this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const handle = await fs.open(
      fullPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_APPEND
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.chmod(0o600);
      await handle.writeFile(content, "utf-8");
    } finally {
      await handle.close();
    }
    const updatedContent = await this.readFileNoFollow(fullPath);
    await this.updateSearchDocument(relativePath, updatedContent);
    this.scheduleSearchCacheSave();
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = await this.resolvePath(relativePath);
    await fs.unlink(fullPath);
    if (this.searchIndexReady) {
      this.searchIndex.removeDocument(relativePath.replace(/\\/g, "/"));
    }
    this.scheduleSearchCacheSave();
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = await this.resolvePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(subDirectory: string = ""): Promise<FileItem[]> {
    const targetDir = await this.resolvePath(subDirectory, true);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const items: FileItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }

      const full = path.join(targetDir, entry.name);
      const relative = path.relative(this.vaultPath, full);
      const stats = await fs.stat(full).catch(() => null);
      items.push({
        path: relative,
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats?.size,
        mtime: stats?.mtime,
      });
    }

    return items;
  }

  async searchFiles(
    query: string,
    maxResults: number = 20,
  ): Promise<{ path: string; matches: string[] }[]> {
    const trimmedQuery = query.trim();
    const limit = Math.min(Math.max(maxResults, 1), 100);
    if (trimmedQuery === "") {
      return [];
    }

    await this.ensureSearchIndex();
    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const cacheKey = `${normalizedQuery}:${limit}`;
    const cached = this.searchIndex.getCachedResults<
      { path: string; matches: string[] }
    >(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const candidates = this.searchIndex.findCandidates(normalizedQuery, limit * 4);
    const results: { path: string; matches: string[] }[] = [];

    for (const relativePath of candidates) {
      if (results.length >= limit) {
        break;
      }

      try {
        const fullPath = await this.resolvePath(relativePath);
        const [content, stats] = await Promise.all([
          this.readFileNoFollow(fullPath),
          fs.stat(fullPath),
        ]);
        const indexed = this.searchIndex.getDocument(relativePath);
        if (indexed?.mtimeMs !== stats.mtimeMs) {
          this.searchIndex.setDocument(
            relativePath,
            path.basename(relativePath),
            content,
            stats.mtimeMs,
            stats.size,
          );
        }

        const nameMatches = normalizeSearchText(path.basename(relativePath))
          .includes(normalizedQuery);
        const contentMatches = normalizeSearchText(content)
          .includes(normalizedQuery);
        if (!nameMatches && !contentMatches) {
          continue;
        }

        const matchingLines = extractMatchingLines(content, normalizedQuery);
        results.push({
          path: relativePath,
          matches: matchingLines.length > 0
            ? matchingLines
            : [path.basename(relativePath)],
        });
      } catch {
        // Ignore deleted or unreadable candidates.
      }
    }

    this.searchIndex.setCachedResults(cacheKey, results);
    this.scheduleSearchCacheSave();
    return results;
  }

  private async ensureSearchIndex(): Promise<void> {
    if (this.searchIndexReady) {
      return;
    }
    if (this.searchIndexPromise) {
      await this.searchIndexPromise;
      return;
    }

    this.searchIndexPromise = this.rebuildSearchIndex();
    await this.searchIndexPromise;
  }

  private async rebuildSearchIndex(): Promise<void> {
    this.searchIndex.clear();
    await this.searchCache.load(this.searchIndex);
    const currentPaths = new Set<string>();

    await this.indexDirectory(this.vaultPath, currentPaths);

    for (const stalePath of this.searchIndex.getDocumentPaths()) {
      if (!currentPaths.has(stalePath)) {
        this.searchIndex.removeDocument(stalePath);
      }
    }

    this.searchIndexReady = true;
    await this.searchCache.save(this.searchIndex);
  }

  private async indexDirectory(
    directory: string,
    currentPaths: Set<string>,
  ): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await this.indexDirectory(fullPath, currentPaths);
        continue;
      }
      if (
        !entry.isFile() ||
        (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt"))
      ) {
        continue;
      }

      try {
        const relativePath = path.relative(this.vaultPath, fullPath)
          .replace(/\\/g, "/");
        const stats = await fs.stat(fullPath);
        currentPaths.add(relativePath);
        const indexed = this.searchIndex.getDocument(relativePath);

        if (
          indexed?.mtimeMs === stats.mtimeMs &&
          indexed.sizeBytes === stats.size
        ) {
          continue;
        }

        const content = await this.readFileNoFollow(fullPath);
        this.searchIndex.setDocument(
          relativePath,
          entry.name,
          content,
          stats.mtimeMs,
          stats.size,
        );
      } catch {
        // Ignore unreadable files.
      }
    }
  }

  private async updateSearchDocument(
    relativePath: string,
    content: string,
  ): Promise<void> {
    if (!this.searchIndexReady) {
      return;
    }

    const normalizedPath = relativePath.replace(/\\/g, "/");
    const fullPath = await this.resolvePath(normalizedPath);
    const stats = await fs.stat(fullPath).catch(() => null);
    this.searchIndex.setDocument(
      normalizedPath,
      path.basename(normalizedPath),
      content,
      stats?.mtimeMs,
      stats?.size,
    );
  }

  private async readFileNoFollow(fullPath: string): Promise<string> {
    const handle = await fs.open(
      fullPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    try {
      return await handle.readFile("utf-8");
    } finally {
      await handle.close();
    }
  }

  private scheduleSearchCacheSave(): void {
    if (this.searchCacheSaveTimer !== null) {
      clearTimeout(this.searchCacheSaveTimer);
    }
    this.searchCacheSaveTimer = setTimeout(() => {
      this.searchCacheSaveTimer = null;
      void this.searchCache.save(this.searchIndex);
    }, 250);
  }
}
