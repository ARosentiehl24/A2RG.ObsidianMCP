import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { TextSearchIndex, TextSearchSnapshot } from "./search-index.js";

export class PersistentSearchCache {
  constructor(private readonly cachePath: string) {}

  async load(index: TextSearchIndex): Promise<boolean> {
    try {
      const cacheDirectoryStat = await fs.lstat(path.dirname(this.cachePath));
      if (
        !cacheDirectoryStat.isDirectory() ||
        (process.platform !== "win32" && (cacheDirectoryStat.mode & 0o077) !== 0)
      ) {
        return false;
      }

      const cacheStat = await fs.lstat(this.cachePath);
      if (
        !cacheStat.isFile() ||
        (process.platform !== "win32" && (cacheStat.mode & 0o077) !== 0)
      ) {
        return false;
      }

      const raw = await fs.readFile(this.cachePath);
      const parsed: unknown = JSON.parse(gunzipSync(raw).toString("utf-8"));
      if (!isTextSearchSnapshot(parsed)) {
        return false;
      }
      index.restoreSnapshot(parsed);
      return true;
    } catch {
      return false;
    }
  }

  async save(index: TextSearchIndex): Promise<boolean> {
    try {
      const cacheDirectory = path.dirname(this.cachePath);
      await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
      await fs.chmod(cacheDirectory, 0o700).catch(() => undefined);

      const temporaryPath = `${this.cachePath}.tmp`;
      const compressed = gzipSync(
        Buffer.from(JSON.stringify(index.toSnapshot()), "utf-8"),
        { level: 6 },
      );
      await fs.writeFile(
        temporaryPath,
        compressed,
        { mode: 0o600 },
      );
      await fs.chmod(temporaryPath, 0o600);
      await fs.rename(temporaryPath, this.cachePath);
      await fs.chmod(this.cachePath, 0o600);
      return true;
    } catch {
      return false;
    }
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
  const queryCache = readProperty(value, "queryCache");

  return version === 3
    && Array.isArray(documents)
    && Array.isArray(trigrams)
    && Array.isArray(bigrams)
    && Array.isArray(nameTrigrams)
    && Array.isArray(nameBigrams)
    && Array.isArray(termPostings)
    && Array.isArray(documentLengths)
    && Array.isArray(nameTermPostings)
    && Array.isArray(nameDocumentLengths)
    && Array.isArray(queryCache);
}

function readProperty(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
