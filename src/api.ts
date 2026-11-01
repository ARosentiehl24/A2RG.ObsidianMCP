import https from "node:https";

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private agent: https.Agent;

  constructor(baseUrl: string, apiKey: string, timeoutMs: number = 3000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.request("/", { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getActiveFile(): Promise<ApiResponse<string>> {
    return this.request<string>("/active/", {
      method: "GET",
      headers: { Accept: "text/markdown" },
    });
  }

  async getFile(vaultRelativePath: string): Promise<ApiResponse<string>> {
    const encoded = encodeURI(vaultRelativePath.replace(/^\/+/, ""));
    return this.request<string>(`/vault/${encoded}`, {
      method: "GET",
      headers: { Accept: "text/markdown" },
    });
  }

  async putFile(vaultRelativePath: string, content: string): Promise<ApiResponse<void>> {
    const encoded = encodeURI(vaultRelativePath.replace(/^\/+/, ""));
    return this.request<void>(`/vault/${encoded}`, {
      method: "PUT",
      headers: { "Content-Type": "text/markdown" },
      body: content,
    });
  }

  async deleteFile(vaultRelativePath: string): Promise<ApiResponse<void>> {
    const encoded = encodeURI(vaultRelativePath.replace(/^\/+/, ""));
    return this.request<void>(`/vault/${encoded}`, {
      method: "DELETE",
    });
  }

  private async request<T>(
    endpoint: string,
    options: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
        // @ts-ignore - Node fetch soporta dispatcher o agent mediante opciones
        dispatcher: undefined,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";
      let data: any;

      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => undefined);
      } else {
        data = await response.text().catch(() => undefined);
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP error ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: data as T,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        ok: false,
        status: 0,
        error: err?.message || "Network request failed",
      };
    }
  }
}
