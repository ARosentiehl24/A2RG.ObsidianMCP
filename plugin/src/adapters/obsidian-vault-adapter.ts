import {
  App,
  normalizePath,
  Plugin,
  TFile,
  TFolder,
} from "obsidian";
import {
  normalizeRelativePath,
  normalizeNoteRelativePath,
  VaultOperationError,
  VaultFileItem,
  VaultGraphNeighbor,
  VaultPort,
  VaultSearchMatch,
} from "../ports/vault-port";
import { ObsidianGraphService } from "../services/obsidian-graph-service";
import { ObsidianSearchService } from "../services/obsidian-search-service";

export class ObsidianVaultAdapter implements VaultPort {
  private readonly searchService: ObsidianSearchService;
  private readonly graphService: ObsidianGraphService;

  constructor(
    private readonly app: App,
    plugin: Plugin,
    searchCachePath?: string,
  ) {
    this.searchService = new ObsidianSearchService(
      app,
      plugin,
      searchCachePath,
    );
    this.graphService = new ObsidianGraphService(app, plugin);
  }

  startIndexing(): void {
    this.searchService.startIndexing();
  }

  async readFile(relativePath: string): Promise<string | null> {
    const path = normalizeNoteRelativePath(relativePath);
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile
      ? this.app.vault.read(file)
      : null;
  }

  async writeFile(relativePath: string, content: string): Promise<boolean> {
    const path = normalizeNoteRelativePath(relativePath);
    await this.ensureParentFolders(path);

    const existing = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (existing instanceof TFolder) {
      throw new VaultOperationError(
        "folder_exists",
        "A folder exists at the requested path",
      );
    }

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(normalizePath(path), content);
    }

    this.searchService.clearResultCache();
    return true;
  }

  async appendFile(relativePath: string, content: string): Promise<boolean> {
    const path = normalizeNoteRelativePath(relativePath);
    await this.ensureParentFolders(path);

    const existing = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (existing instanceof TFolder) {
      throw new VaultOperationError(
        "folder_exists",
        "A folder exists at the requested path",
      );
    }

    if (existing instanceof TFile) {
      await this.app.vault.append(existing, content);
    } else {
      await this.app.vault.create(normalizePath(path), content);
    }

    this.searchService.clearResultCache();
    return true;
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    const path = normalizeNoteRelativePath(relativePath);
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
      return false;
    }

    await this.app.vault.delete(file);
    this.searchService.removeDocument(file.path);
    return true;
  }

  async listFiles(directory = ""): Promise<VaultFileItem[]> {
    const path = normalizeRelativePath(directory, true);
    const folder =
      path === ""
        ? this.app.vault.getRoot()
        : this.app.vault.getAbstractFileByPath(normalizePath(path));

    if (!(folder instanceof TFolder)) {
      throw new VaultOperationError(
        "directory_not_found",
        "Directory not found",
      );
    }

    return folder.children
      .filter((child) => !child.name.startsWith("."))
      .map((child) => {
        if (child instanceof TFile) {
          return {
            path: child.path,
            name: child.name,
            isDirectory: false,
            size: child.stat.size,
            mtime: child.stat.mtime,
          };
        }
        return {
          path: child.path,
          name: child.name,
          isDirectory: true,
        };
      });
  }

  async searchFiles(
    query: string,
    maxResults = 20,
  ): Promise<VaultSearchMatch[]> {
    return this.searchService.searchFiles(query, maxResults);
  }

  getGraphNeighbors(
    relativePath: string,
    direction: "incoming" | "outgoing" | "both" = "both",
    depth = 1,
    maxResults = 20,
  ): Promise<VaultGraphNeighbor[]> {
    return Promise.resolve(
      this.graphService.getNeighbors(
        relativePath,
        direction,
        depth,
        maxResults,
      ),
    );
  }

  async getActiveFile(): Promise<string | null> {
    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile
      ? this.app.vault.read(file)
      : null;
  }

  async flushSearchCache(): Promise<void> {
    await this.searchService.flushSearchCache();
  }

  private async ensureParentFolders(relativePath: string): Promise<void> {
    const lastSlash = relativePath.lastIndexOf("/");
    if (lastSlash < 0) {
      return;
    }

    let current = "";
    for (const segment of relativePath.slice(0, lastSlash).split("/")) {
      current = current === "" ? segment : `${current}/${segment}`;
      const existing = this.app.vault.getAbstractFileByPath(
        normalizePath(current),
      );
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing instanceof TFile) {
        throw new VaultOperationError(
          "cannot_create_folder",
          `Cannot create folder because a file exists at ${current}`,
        );
      }
      await this.app.vault.createFolder(normalizePath(current));
    }
  }
}
