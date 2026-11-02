import type { GraphNeighbor } from "./api.js";
import type { McpVaultPort, RestApiPort } from "./ports.js";
import type { FileItem } from "./vault.js";

export class HybridRouter {
  private readonly api: RestApiPort;
  private readonly vault: McpVaultPort;
  private readonly preferRestApi: boolean;

  constructor(api: RestApiPort, vault: McpVaultPort, preferRestApi: boolean = true) {
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
      this.throwDefiniteApiError(apiRes);
      this.throwAmbiguousMutation(apiRes, "read");
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
      this.throwDefiniteApiError(apiRes);
      this.throwAmbiguousMutation(apiRes, "write");
    }

    await this.vault.writeFile(path, content);
    return { source: "filesystem" };
  }

  async appendFile(path: string, contentToAppend: string): Promise<{ source: "api" | "filesystem" }> {
    if (this.preferRestApi) {
      const apiRes = await this.api.appendFile(path, contentToAppend);
      if (apiRes.ok) {
        return { source: "api" };
      }
      this.throwDefiniteApiError(apiRes);
      this.throwAmbiguousMutation(apiRes, "append");
    }

    await this.vault.appendFile(path, contentToAppend);
    return { source: "filesystem" };
  }

  async deleteFile(path: string): Promise<{ source: "api" | "filesystem" }> {
    if (this.preferRestApi) {
      const apiRes = await this.api.deleteFile(path);
      if (apiRes.ok) {
        return { source: "api" };
      }
      this.throwDefiniteApiError(apiRes);
      this.throwAmbiguousMutation(apiRes, "delete");
    }

    await this.vault.deleteFile(path);
    return { source: "filesystem" };
  }

  async listFiles(subDirectory: string = ""): Promise<FileItem[]> {
    if (this.preferRestApi) {
      const apiRes = await this.api.listFiles(subDirectory);
      if (apiRes.ok && Array.isArray(apiRes.data)) {
        return apiRes.data as FileItem[];
      }
      this.throwDefiniteApiError(apiRes);
    }
    return await this.vault.listFiles(subDirectory);
  }

  async search(query: string, maxResults?: number): Promise<{ path: string; matches: string[] }[]> {
    if (this.preferRestApi) {
      const apiRes = await this.api.search(query, maxResults);
      if (apiRes.ok && Array.isArray(apiRes.data)) {
        return apiRes.data;
      }
      this.throwDefiniteApiError(apiRes);
    }
    return await this.vault.searchFiles(query, maxResults);
  }

  async getGraphNeighbors(
    path: string,
    direction: "incoming" | "outgoing" | "both" = "both",
    depth: number = 1,
    maxResults: number = 20,
  ): Promise<GraphNeighbor[]> {
    if (this.preferRestApi) {
      const apiRes = await this.api.getGraphNeighbors(
        path,
        direction,
        depth,
        maxResults,
      );
      if (apiRes.ok && Array.isArray(apiRes.data)) {
        return apiRes.data;
      }
      this.throwDefiniteApiError(apiRes);
    }
    return [];
  }

  async getActiveFile(): Promise<{ content: string } | null> {
    const apiRes = await this.api.getActiveFile();
    if (apiRes.ok && typeof apiRes.data === "string") {
      return { content: apiRes.data };
    }
    return null;
  }

  private throwDefiniteApiError(response: { status: number; error?: string }): void {
    if (response.status !== 0) {
      throw new Error(response.error || `REST request failed with status ${response.status}`);
    }
  }

  private throwAmbiguousMutation(
    response: { status: number; ambiguous?: boolean },
    operation: "read" | "write" | "append" | "delete",
  ): void {
    if (response.status === 0 && response.ambiguous) {
      throw new Error(
        `${operation[0]?.toUpperCase()}${operation.slice(1)} status is unknown after a REST transport failure; filesystem fallback was skipped`,
      );
    }
  }
}
