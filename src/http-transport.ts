import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";

export interface HttpRequestOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  ambiguous?: boolean;
}

export class HttpTransport {
  private readonly caCert?: Buffer;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    caCertPath: string = "",
  ) {
    if (caCertPath) {
      try {
        this.caCert = readFileSync(caCertPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not read TLS CA certificate: ${message}`);
      }
    }
  }

  async request<T>(
    endpoint: string,
    options: HttpRequestOptions,
    maxResponseBytes: number,
  ): Promise<HttpResult<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    const headers: Record<string, string> = { ...options.headers };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    if (options.body && !headers["Content-Length"]) {
      headers["Content-Length"] = String(Buffer.byteLength(options.body));
    }

    return new Promise((resolve) => {
      const requestOptions: http.RequestOptions | https.RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers,
        ...(url.protocol === "https:"
          ? {
              rejectUnauthorized: true,
              ...(this.caCert ? { ca: this.caCert } : {}),
            }
          : {}),
      };

      let timeout: ReturnType<typeof globalThis.setTimeout>;
      let timedOut = false;

      const request = url.protocol === "https:"
        ? https.request(requestOptions as https.RequestOptions, handleResponse)
        : http.request(requestOptions as http.RequestOptions, handleResponse);

      timeout = globalThis.setTimeout(() => {
        timedOut = true;
        request.destroy(new Error("Request timeout"));
      }, this.timeoutMs);

      request.on("error", (error: NodeJS.ErrnoException) => {
        globalThis.clearTimeout(timeout);
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as NodeJS.ErrnoException).code ?? "")
            : "";
        const ambiguous =
          timedOut ||
          code === "ECONNRESET" ||
          code === "ECONNABORTED" ||
          code === "ETIMEDOUT";
        resolve({
          ok: false,
          status: 0,
          error: error.message || "Network request failed",
          ambiguous,
        });
      });

      if (options.body) {
        request.write(options.body);
      }
      request.end();

      function handleResponse(response: http.IncomingMessage): void {
        let body = "";
        let bodyBytes = 0;
        let rejectedForSize = false;

        response.setEncoding("utf-8");
        response.on("data", (chunk) => {
          bodyBytes += Buffer.byteLength(chunk);
          if (bodyBytes > maxResponseBytes) {
            rejectedForSize = true;
            globalThis.clearTimeout(timeout);
            response.destroy();
            resolve({
              ok: false,
              status: 0,
              error: "Response exceeds the 5 MB limit",
              ambiguous: true,
            });
            return;
          }
          body += chunk;
        });

        response.on("end", () => {
          if (rejectedForSize) {
            return;
          }
          globalThis.clearTimeout(timeout);
          const contentType = response.headers["content-type"] ?? "";
          let data: unknown = body;

          if (String(contentType).includes("application/json") && body !== "") {
            try {
              data = JSON.parse(body) as unknown;
            } catch {
              data = body;
            }
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            resolve({
              ok: false,
              status: response.statusCode ?? 0,
              error: `HTTP error ${response.statusCode}: ${body || "Empty response"}`,
            });
            return;
          }

          resolve({
            ok: true,
            status: response.statusCode,
            data: data as T,
          });
        });
      }
    });
  }
}
