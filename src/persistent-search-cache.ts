import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { TextSearchIndex, TextSearchSnapshot } from "./search-index.js";

export class PersistentSearchCache {
  constructor(
    private readonly cachePath: string,
    private readonly cacheRoot: string = path.dirname(cachePath),
  ) {}

  async load(index: TextSearchIndex): Promise<boolean> {
    try {
      const cacheDirectory = path.dirname(this.cachePath);
      if (!await this.hasSafeCachePath(cacheDirectory)) {
        return false;
      }
      const cacheDirectoryStat = await fs.lstat(cacheDirectory);
      if (
        !cacheDirectoryStat.isDirectory() ||
        (process.platform !== "win32" && (cacheDirectoryStat.mode & 0o077) !== 0)
      ) {
        return false;
      }

      const handle = await fs.open(
        this.cachePath,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
      );
      try {
        const cacheStat = await handle.stat();
        if (
          !cacheStat.isFile()
          || (process.platform !== "win32" && (cacheStat.mode & 0o077) !== 0)
        ) {
          return false;
        }
        const raw = await handle.readFile();
        const parsed: unknown = JSON.parse(gunzipSync(raw).toString("utf-8"));
        if (!isTextSearchSnapshot(parsed)) {
          return false;
        }
        index.restoreSnapshot(parsed);
        return true;
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }

  async save(index: TextSearchIndex): Promise<boolean> {
    try {
      const cacheDirectory = path.dirname(this.cachePath);
      await this.createSafeCacheDirectory(cacheDirectory);

      const temporaryPath = path.join(
        cacheDirectory,
        `.${path.basename(this.cachePath)}.${randomUUID()}.tmp`,
      );
      const compressed = gzipSync(
        Buffer.from(JSON.stringify(index.toSnapshot()), "utf-8"),
        { level: 6 },
      );
      const handle = await fs.open(
        temporaryPath,
        fsConstants.O_WRONLY
          | fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.writeFile(compressed);
      } finally {
        await handle.close();
      }
      try {
        await fs.rename(temporaryPath, this.cachePath);
      } catch (error: unknown) {
        await fs.unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
      return true;
    } catch {
      return false;
    }
  }

  private async createSafeCacheDirectory(cacheDirectory: string): Promise<void> {
    const relative = path.relative(this.cacheRoot, cacheDirectory);
    if (
      relative === ".."
      || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative)
    ) {
      throw new Error("Search cache path must remain inside its cache root");
    }

    await fs.mkdir(this.cacheRoot, { mode: 0o700 }).catch((error: unknown) => {
      if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "EEXIST"
      ) {
        return undefined;
      }
      throw error;
    });
    const rootStat = await fs.lstat(this.cacheRoot);
    if (!rootStat.isDirectory()) {
      throw new Error("Search cache root contains a symlink");
    }

    if (relative === "") {
      return;
    }

    let current = this.cacheRoot;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      await fs.mkdir(current, { mode: 0o700 }).catch((error: unknown) => {
        if (
          typeof error === "object"
          && error !== null
          && "code" in error
          && error.code === "EEXIST"
        ) {
          return undefined;
        }
        throw error;
      });
      const stat = await fs.lstat(current);
      if (!stat.isDirectory()) {
        throw new Error("Search cache directory contains a symlink");
      }
    }
  }

  private async hasSafeCachePath(cacheDirectory: string): Promise<boolean> {
    const relative = path.relative(this.cacheRoot, cacheDirectory);
    if (
      relative === ".."
      || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative)
    ) {
      return false;
    }

    const rootStat = await fs.lstat(this.cacheRoot);
    if (!rootStat.isDirectory()) {
      return false;
    }
    if (relative === "") {
      return true;
    }

    let current = this.cacheRoot;
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      const stat = await fs.lstat(current);
      if (!stat.isDirectory()) {
        return false;
      }
    }
    return true;
  }
}

function isTextSearchSnapshot(value: unknown): value is TextSearchSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const version = readProperty(value, "version");
  const documents = readProperty(value, "documents");
  const trigrams = readProperty(value, "trigrams");
  const bigrams = readProperty(value, "bigrams");
  const nameTrigrams = readProperty(value, "nameTrigrams");
  const nameBigrams = readProperty(value, "nameBigrams");
  const termPostings = readProperty(value, "termPostings");
  const documentLengths = readProperty(value, "documentLengths");
  const nameTermPostings = readProperty(value, "nameTermPostings");
  const nameDocumentLengths = readProperty(value, "nameDocumentLengths");
  const titleTermPostings = readProperty(value, "titleTermPostings");
  const titleDocumentLengths = readProperty(value, "titleDocumentLengths");
  const headingTermPostings = readProperty(value, "headingTermPostings");
  const headingDocumentLengths = readProperty(value, "headingDocumentLengths");
  const tagTermPostings = readProperty(value, "tagTermPostings");
  const tagDocumentLengths = readProperty(value, "tagDocumentLengths");
  const frontmatterTermPostings = readProperty(value, "frontmatterTermPostings");
  const frontmatterDocumentLengths = readProperty(value, "frontmatterDocumentLengths");
  const queryCache = readProperty(value, "queryCache");

  return version === 4
    && Array.isArray(documents)
    && Array.isArray(trigrams)
    && Array.isArray(bigrams)
    && Array.isArray(nameTrigrams)
    && Array.isArray(nameBigrams)
    && Array.isArray(termPostings)
    && Array.isArray(documentLengths)
    && Array.isArray(nameTermPostings)
    && Array.isArray(nameDocumentLengths)
    && Array.isArray(titleTermPostings)
    && Array.isArray(titleDocumentLengths)
    && Array.isArray(headingTermPostings)
    && Array.isArray(headingDocumentLengths)
    && Array.isArray(tagTermPostings)
    && Array.isArray(tagDocumentLengths)
    && Array.isArray(frontmatterTermPostings)
    && Array.isArray(frontmatterDocumentLengths)
    && Array.isArray(queryCache);
}

function readProperty(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
