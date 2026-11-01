import fs from "node:fs/promises";
import path from "node:path";

export interface FileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  mtime?: Date;
}

export class VaultManager {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  private resolvePath(relativePath: string): string {
    const cleaned = relativePath.replace(/^[\/\\]+/, "");
    const resolved = path.resolve(this.vaultPath, cleaned);
    if (!resolved.startsWith(this.vaultPath)) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }
    return resolved;
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    return await fs.readFile(fullPath, "utf-8");
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async appendFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, content, "utf-8");
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    await fs.unlink(fullPath);
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(subDirectory: string = ""): Promise<FileItem[]> {
    const targetDir = this.resolvePath(subDirectory);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    const items: FileItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
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

  async searchFiles(query: string, maxResults: number = 20): Promise<{ path: string; matches: string[] }[]> {
    const results: { path: string; matches: string[] }[] = [];
    const lowerQuery = query.toLowerCase();

    async function walk(dir: string, baseDir: string) {
      if (results.length >= maxResults) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(full, baseDir);
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
          try {
            const content = await fs.readFile(full, "utf-8");
            if (content.toLowerCase().includes(lowerQuery) || entry.name.toLowerCase().includes(lowerQuery)) {
              const lines = content.split("\n");
              const matchingLines = lines
                .filter((l) => l.toLowerCase().includes(lowerQuery))
                .slice(0, 3)
                .map((l) => l.trim());

              results.push({
                path: path.relative(baseDir, full),
                matches: matchingLines.length > 0 ? matchingLines : [entry.name],
              });

              if (results.length >= maxResults) return;
            }
          } catch {
            // Ignorar errores de lectura en archivos bloqueados o binarios
          }
        }
      }
    }

    await walk(this.vaultPath, this.vaultPath);
    return results;
  }
}
