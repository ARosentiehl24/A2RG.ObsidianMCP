import {
  App,
  CachedMetadata,
  Plugin,
  TFile,
} from "obsidian";
import {
  extractMatchingLines,
  matchesSearchQuery,
  normalizeSearchText,
  TextSearchIndex,
} from "../../../src/search-index";
import type { VaultSearchMatch } from "../ports/vault-port";

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) {
        await handler(item);
      }
    }
  });
  await Promise.all(workers);
}

export class ObsidianSearchService {
  private readonly searchIndex = new TextSearchIndex();
  private searchIndexReady = false;
  private searchIndexPromise: Promise<void> | null = null;
  private reconciliationPromise: Promise<void> | null = null;
  private readonly incomingLinkCounts = new Map<string, number>();

  constructor(
    private readonly app: App,
    private readonly plugin: Plugin,
  ) {}

  startIndexing(): void {
    this.rebuildIncomingLinkCounts();
    this.plugin.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && this.isSearchableFile(file)) {
          this.clearResultCache();
          this.rebuildIncomingLinkCounts();
          void this.indexFile(file);
        }
      }),
    );
    this.plugin.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && this.isSearchableFile(file)) {
          this.clearResultCache();
          this.rebuildIncomingLinkCounts();
          void this.indexFile(file);
        }
      }),
    );
    this.plugin.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.searchIndex.removeDocument(file.path);
          this.clearResultCache();
          this.rebuildIncomingLinkCounts();
        }
      }),
    );
    this.plugin.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.searchIndex.removeDocument(oldPath);
        if (file instanceof TFile && this.isSearchableFile(file)) {
          this.clearResultCache();
          this.rebuildIncomingLinkCounts();
          void this.indexFile(file);
        }
      }),
    );
    this.plugin.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) => {
        this.clearResultCache();
        this.rebuildIncomingLinkCounts();
        void this.indexFile(file, data, cache);
      }),
    );
    this.plugin.registerEvent(
      this.app.metadataCache.on("deleted", (file) => {
        this.searchIndex.removeDocument(file.path);
        this.clearResultCache();
        this.rebuildIncomingLinkCounts();
      }),
    );
    this.plugin.registerEvent(
      this.app.metadataCache.on("resolve", () => {
        this.clearResultCache();
        this.rebuildIncomingLinkCounts();
      }),
    );
    void this.ensureSearchIndex();
  }

  async searchFiles(
    query: string,
    maxResults = 20,
  ): Promise<VaultSearchMatch[]> {
    const trimmedQuery = query.trim();
    const limit = Math.min(Math.max(maxResults, 1), 100);
    if (trimmedQuery === "") {
      return [];
    }

    await this.ensureSearchIndex();
    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const cacheKey = `${normalizedQuery}:${limit}`;
    const cached = this.searchIndex.getCachedResults<VaultSearchMatch>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let candidates = this.searchIndex.findCandidates(
      normalizedQuery,
      limit * 4,
    );
    if (
      candidates.length === 0
      && this.reconciliationPromise !== null
    ) {
      await this.reconciliationPromise;
      candidates = this.searchIndex.findCandidates(
        normalizedQuery,
        limit * 4,
      );
    }
    const candidateRanks = new Map(
      candidates.map((candidate, index) => [candidate, index]),
    );
    const results: VaultSearchMatch[] = [];

    for (const candidatePath of candidates) {
      if (results.length >= limit) {
        break;
      }
      const file = this.app.vault.getAbstractFileByPath(candidatePath);
      if (!(file instanceof TFile) || !this.isSearchableFile(file)) {
        continue;
      }

      const indexed = this.searchIndex.getDocument(candidatePath);
      if (
        indexed?.mtimeMs !== file.stat.mtime ||
        indexed.sizeBytes !== file.stat.size
      ) {
        await this.indexFile(file);
      }

      const content = await this.app.vault.cachedRead(file);
      const searchableContent = this.buildSearchableContent(
        content,
        this.app.metadataCache.getFileCache(file),
      );
      const nameMatches = matchesSearchQuery(file.name, normalizedQuery);
      const contentMatches = matchesSearchQuery(
        searchableContent,
        normalizedQuery,
      );
      if (!nameMatches && !contentMatches) {
        continue;
      }

      const matchingLines = extractMatchingLines(content, normalizedQuery);
      results.push({
        path: file.path,
        matches: matchingLines.length > 0
          ? matchingLines
          : [file.name],
        backlinks: this.countIncomingLinks(file.path),
      });
    }

    const rankedResults = results
      .sort((left, right) => {
        const leftRank = candidateRanks.get(left.path) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = candidateRanks.get(right.path) ?? Number.MAX_SAFE_INTEGER;
        return leftRank - rightRank
          || (right.backlinks ?? 0) - (left.backlinks ?? 0)
          || left.path.localeCompare(right.path);
      })
      .slice(0, limit);

    this.searchIndex.setCachedResults(cacheKey, rankedResults);
    return rankedResults;
  }

  clearResultCache(): void {
    this.searchIndex.clearResultCache();
  }

  removeDocument(path: string): void {
    this.searchIndex.removeDocument(path);
  }

  async flushSearchCache(): Promise<void> {
    return Promise.resolve();
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
    this.searchIndexReady = true;
    if (this.reconciliationPromise === null) {
      this.reconciliationPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          void this.indexKnownFiles().then(resolve);
        }, 500);
      });
      void this.reconciliationPromise.finally(() => {
        this.reconciliationPromise = null;
      });
    }
  }

  private async indexFile(
    file: TFile,
    data?: string,
    cache?: CachedMetadata,
  ): Promise<void> {
    if (!this.isSearchableFile(file)) {
      return;
    }

    const content = data ?? await this.app.vault.cachedRead(file);
    const metadata = cache ?? this.app.metadataCache.getFileCache(file);
    const searchableContent = this.buildSearchableContent(content, metadata);

    this.searchIndex.setDocument(
      file.path,
      file.name,
      searchableContent,
      file.stat.mtime,
      file.stat.size,
    );
  }

  private buildSearchableContent(
    content: string,
    cache: CachedMetadata | null,
  ): string {
    if (!cache) {
      return content;
    }

    const metadataText: string[] = [];
    for (const heading of cache.headings ?? []) {
      metadataText.push(heading.heading);
    }
    for (const tag of cache.tags ?? []) {
      metadataText.push(tag.tag);
    }
    if (cache.frontmatter) {
      metadataText.push(JSON.stringify(cache.frontmatter));
    }

    return metadataText.length > 0
      ? `${content}\n${metadataText.join("\n")}`
      : content;
  }

  private async indexKnownFiles(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    await mapWithConcurrency(files, 8, async (file) => {
      await this.indexFile(file);
    });
    const currentPaths = new Set(files.map((file) => file.path));
    for (const stalePath of this.searchIndex.getDocumentPaths()) {
      if (!currentPaths.has(stalePath)) {
        this.searchIndex.removeDocument(stalePath);
      }
    }
  }

  private countIncomingLinks(filePath: string): number {
    return this.incomingLinkCounts.get(filePath) ?? 0;
  }

  private rebuildIncomingLinkCounts(): void {
    this.incomingLinkCounts.clear();
    for (const targets of Object.values(
      this.app.metadataCache.resolvedLinks,
    )) {
      for (const [targetPath, linkCount] of Object.entries(targets)) {
        this.incomingLinkCounts.set(
          targetPath,
          (this.incomingLinkCounts.get(targetPath) ?? 0) + linkCount,
        );
      }
    }
  }

  private isSearchableFile(file: TFile): boolean {
    return file.extension.toLowerCase() === "md";
  }
}
