import { randomUUID } from "node:crypto";
import { HttpTransport } from "./http-transport.js";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  ambiguous?: boolean;
}

export interface GraphNeighbor {
  path: string;
  depth: number;
  linkCount: number;
  direction: "incoming" | "outgoing";
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly transport: HttpTransport;

  constructor(
    baseUrl: string,
    apiKey: string,
    timeoutMs: number = 3000,
    caCertPath: string = "",
    allowInsecureHttp: boolean = false,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.transport = new HttpTransport(
      this.baseUrl,
      apiKey,
      timeoutMs,
      caCertPath,
      allowInsecureHttp,
    );
  }

  async isAvailable(): Promise<boolean> {
    const health = await this.request("/health", { method: "GET" });
    if (health.ok) {
      return true;
    }

    const legacy = await this.request("/", { method: "GET" });
    return legacy.ok;
  }

  async getActiveFile(): Promise<ApiResponse<string>> {
    const active = await this.request<string>("/active", {
      method: "GET",
      headers: { Accept: "text/markdown" },
    });
    if (active.ok) {
      return active;
    }
    return this.request<string>("/active/", {
      method: "GET",
      headers: { Accept: "text/markdown" },
    });
  }

  async getFile(vaultRelativePath: string): Promise<ApiResponse<string>> {
    const encoded = this.encodeVaultPath(vaultRelativePath);
    return this.request<string>(`/vault/${encoded}`, {
      method: "GET",
      headers: { Accept: "text/markdown" },
    });
  }

  async putFile(vaultRelativePath: string, content: string): Promise<ApiResponse<void>> {
    const encoded = this.encodeVaultPath(vaultRelativePath);
    return this.request<void>(`/vault/${encoded}`, {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: content,
    });
  }

  async deleteFile(vaultRelativePath: string): Promise<ApiResponse<void>> {
    const encoded = this.encodeVaultPath(vaultRelativePath);
    return this.request<void>(`/vault/${encoded}`, {
      method: "DELETE",
    });
  }

  async appendFile(vaultRelativePath: string, content: string): Promise<ApiResponse<void>> {
    const idempotencyKey = randomUUID();
    return this.request<void>("/append", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ path: vaultRelativePath, content }),
    });
  }

  async listFiles(directory: string = ""): Promise<ApiResponse<{ path: string; name: string; isDirectory: boolean; size?: number; mtime?: number }[]>> {
    const query = new URLSearchParams({ directory }).toString();
    return this.request(`/list${query ? `?${query}` : ""}`, { method: "GET" });
  }

  async search(query: string, maxResults: number = 20): Promise<ApiResponse<{ path: string; matches: string[] }[]>> {
    const params = new URLSearchParams({
      query,
      limit: String(maxResults),
    });
    return this.request(`/search?${params.toString()}`, { method: "GET" });
  }

  async getGraphNeighbors(
    vaultRelativePath: string,
    direction: "incoming" | "outgoing" | "both",
    depth: number,
    maxResults: number,
  ): Promise<ApiResponse<GraphNeighbor[]>> {
    const params = new URLSearchParams({
      path: vaultRelativePath,
      direction,
      depth: String(depth),
      limit: String(maxResults),
    });
    return this.request(`/graph?${params.toString()}`, { method: "GET" });
  }

  private async request<T>(
    endpoint: string,
    options: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<ApiResponse<T>> {
    return this.transport.request<T>(endpoint, options, MAX_RESPONSE_BYTES);
  }

  private encodeVaultPath(vaultRelativePath: string): string {
    return vaultRelativePath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }
}
