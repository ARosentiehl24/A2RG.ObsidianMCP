import { ApiClient } from "./api.js";
import { VaultManager, FileItem } from "./vault.js";

export class HybridRouter {
  private api: ApiClient;
  private vault: VaultManager;
  private preferRestApi: boolean;

  constructor(api: ApiClient, vault: VaultManager, preferRestApi: boolean = true) {
    this.api = api;
    this.vault = vault;
    this.preferRestApi = preferRestApi;
  }

  async getFile(path: string): Promise<{ content: string; source: "api" | "filesystem" }> {
    if (this.preferRestApi) {
      const apiRes = await this.api.getFile(path);
      if (apiRes.ok && typeof apiRes.data === "string") {
        return { content: apiRes.data, source: "api" };
      }
    }

    const content = await this.vault.readFile(path);
    return { content, source: "filesystem" };
  }

  async writeFile(path: string, content: string): Promise<{ source: "api" | "filesystem" }> {
    if (this.preferRestApi) {
      const apiRes = await this.api.putFile(path, content);
      if (apiRes.ok) {
        return { source: "api" };
      }
    }

    await this.vault.writeFile(path, content);
    return { source: "filesystem" };
  }

  async appendFile(path: string, contentToAppend: string): Promise<{ source: "api" | "filesystem" }> {
    let existing = "";
    try {
      const current = await this.getFile(path);
      existing = current.content;
    } catch {
      existing = "";
    }

    const updated = existing ? `${existing}\n${contentToAppend}` : contentToAppend;
    return await this.writeFile(path, updated);
  }

  async deleteFile(path: string): Promise<{ source: "api" | "filesystem" }> {
    if (this.preferRestApi) {
      const apiRes = await this.api.deleteFile(path);
      if (apiRes.ok) {
        return { source: "api" };
      }
    }

    await this.vault.deleteFile(path);
    return { source: "filesystem" };
  }

  async listFiles(subDirectory: string = ""): Promise<FileItem[]> {
    return await this.vault.listFiles(subDirectory);
  }

  async search(query: string, maxResults?: number): Promise<{ path: string; matches: string[] }[]> {
    return await this.vault.searchFiles(query, maxResults);
  }

  async getActiveFile(): Promise<{ content: string } | null> {
    const apiRes = await this.api.getActiveFile();
    if (apiRes.ok && typeof apiRes.data === "string") {
      return { content: apiRes.data };
    }
    return null;
  }
}
