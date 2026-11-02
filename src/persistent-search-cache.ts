import fs from "node:fs/promises";
import path from "node:path";
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

      const raw = await fs.readFile(this.cachePath, "utf-8");
      const snapshot = JSON.parse(raw) as TextSearchSnapshot;
      if (snapshot.version !== 1) {
        return false;
      }
      index.restoreSnapshot(snapshot);
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
      await fs.writeFile(
        temporaryPath,
        JSON.stringify(index.toSnapshot()),
        { encoding: "utf-8", mode: 0o600 },
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
