import { App, normalizePath, Plugin, TFile } from "obsidian";
import {
  normalizeNoteRelativePath,
  VaultGraphNeighbor,
} from "../ports/vault-port";

export class ObsidianGraphService {
  private readonly outgoingAdjacency = new Map<
    string,
    Map<string, number>
  >();
  private readonly incomingAdjacency = new Map<
    string,
    Map<string, number>
  >();
  private cachedResolvedLinks: Record<string, Record<string, number>> | null =
    null;

  constructor(
    private readonly app: App,
    plugin: Plugin,
  ) {
    plugin.registerEvent(
      this.app.metadataCache.on("resolve", () => {
        this.rebuildAdjacency();
      }),
    );
    this.rebuildAdjacency();
  }

  getNeighbors(
    relativePath: string,
    direction: "incoming" | "outgoing" | "both",
    depth: number,
    maxResults: number,
  ): VaultGraphNeighbor[] {
    const path = normalizeNoteRelativePath(relativePath);
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      return [];
    }

    this.ensureAdjacency();
    const maxDepth = Math.min(Math.max(depth, 1), 3);
    const limit = Math.min(Math.max(maxResults, 1), 100);
    const neighbors = new Map<
      string,
      { depth: number; linkCount: number; direction: "incoming" | "outgoing" }
    >();
    const queue: { path: string; depth: number }[] = [
      { path: file.path, depth: 0 },
    ];
    const visited = new Set<string>([file.path]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) {
        continue;
      }

      const nextDepth = current.depth + 1;
      if (direction === "outgoing" || direction === "both") {
        const targets = this.outgoingAdjacency.get(current.path);
        if (targets) {
          for (const [targetPath, linkCount] of targets) {
            if (visited.has(targetPath)) {
              continue;
            }
            visited.add(targetPath);
            neighbors.set(targetPath, {
              depth: nextDepth,
              linkCount,
              direction: "outgoing",
            });
            queue.push({ path: targetPath, depth: nextDepth });
          }
        }
      }

      if (direction === "incoming" || direction === "both") {
        const sources = this.incomingAdjacency.get(current.path);
        if (sources) {
          for (const [sourcePath, linkCount] of sources) {
            if (visited.has(sourcePath)) {
              continue;
            }
            visited.add(sourcePath);
            neighbors.set(sourcePath, {
              depth: nextDepth,
              linkCount,
              direction: "incoming",
            });
            queue.push({ path: sourcePath, depth: nextDepth });
          }
        }
      }
    }

    return Array.from(neighbors, ([neighborPath, neighbor]) => ({
      path: neighborPath,
      ...neighbor,
    }))
      .sort((left, right) =>
        left.depth - right.depth
        || right.linkCount - left.linkCount
        || left.path.localeCompare(right.path),
      )
      .slice(0, limit);
  }

  private ensureAdjacency(): void {
    if (this.cachedResolvedLinks !== this.app.metadataCache.resolvedLinks) {
      this.rebuildAdjacency();
    }
  }

  private rebuildAdjacency(): void {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    this.cachedResolvedLinks = resolvedLinks;
    this.outgoingAdjacency.clear();
    this.incomingAdjacency.clear();

    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
      const outgoing = new Map<string, number>();
      for (const [targetPath, linkCount] of Object.entries(targets)) {
        outgoing.set(targetPath, linkCount);

        let incoming = this.incomingAdjacency.get(targetPath);
        if (!incoming) {
          incoming = new Map<string, number>();
          this.incomingAdjacency.set(targetPath, incoming);
        }
        incoming.set(sourcePath, linkCount);
      }
      if (outgoing.size > 0) {
        this.outgoingAdjacency.set(sourcePath, outgoing);
      }
    }
  }
}
