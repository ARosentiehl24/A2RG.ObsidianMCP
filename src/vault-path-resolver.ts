import fs from "node:fs/promises";
import path from "node:path";

export class VaultPathResolver {
  constructor(private readonly vaultPath: string) {}

  async resolve(relativePath: string, allowRoot = false): Promise<string> {
    const rawInput = relativePath.trim();
    if (
      rawInput.startsWith("/") ||
      rawInput.startsWith("\\\\") ||
      /^[A-Za-z]:[\\/]/.test(rawInput)
    ) {
      throw new Error(`Absolute vault paths are not allowed: ${relativePath}`);
    }

    const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (cleaned === "" && allowRoot) {
      return await fs.realpath(path.resolve(this.vaultPath));
    }

    if (
      cleaned === "" ||
      cleaned.split("/").some(
        (segment) =>
          segment === "." ||
          segment === ".." ||
          segment === "" ||
          segment.startsWith("."),
      ) ||
      /^[A-Za-z]:\//.test(cleaned)
    ) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }

    if (!allowRoot && !/\.(md|txt)$/i.test(cleaned)) {
      throw new Error("Only Markdown and text files are allowed");
    }

    const vaultRealPath = await fs.realpath(path.resolve(this.vaultPath));
    const resolved = path.resolve(vaultRealPath, cleaned);
    const relative = path.relative(vaultRealPath, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }

    const segments = cleaned.split("/");
    let currentPath = vaultRealPath;
    for (let index = 0; index < segments.length; index += 1) {
      currentPath = path.join(currentPath, segments[index] ?? "");
      const stat = await fs.lstat(currentPath).catch(() => null);
      if (!stat) {
        continue;
      }
      if (stat.isSymbolicLink()) {
        throw new Error(`Path traversal denied: ${relativePath}`);
      }
      if (index < segments.length - 1 && !stat.isDirectory()) {
        throw new Error(`Path traversal denied: ${relativePath}`);
      }
      if (index === segments.length - 1 && stat.isDirectory() && !allowRoot) {
        throw new Error(`Path traversal denied: ${relativePath}`);
      }
    }

    await this.assertResolvedInsideVault(vaultRealPath, resolved, relativePath);
    return resolved;
  }

  private async assertResolvedInsideVault(
    vaultRealPath: string,
    resolved: string,
    relativePath: string,
  ): Promise<void> {
    const targetRealPath = await fs.realpath(resolved).catch(() => null);
    if (targetRealPath) {
      this.assertRelativeInsideVault(vaultRealPath, targetRealPath, relativePath);
      return;
    }

    let parentCandidate = path.dirname(resolved);
    let parentRealPath: string | null = null;
    while (true) {
      parentRealPath = await fs.realpath(parentCandidate).catch(() => null);
      if (parentRealPath) {
        break;
      }
      if (parentCandidate === vaultRealPath) {
        break;
      }
      const nextParent = path.dirname(parentCandidate);
      if (nextParent === parentCandidate) {
        break;
      }
      parentCandidate = nextParent;
    }

    if (parentRealPath) {
      this.assertRelativeInsideVault(vaultRealPath, parentRealPath, relativePath);
    }
  }

  private assertRelativeInsideVault(
    vaultRealPath: string,
    candidateRealPath: string,
    relativePath: string,
  ): void {
    const relative = path.relative(vaultRealPath, candidateRealPath);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }
  }
}
