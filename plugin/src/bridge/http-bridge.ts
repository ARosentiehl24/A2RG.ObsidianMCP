import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { AddressInfo } from "node:net";
import {
  normalizeNoteRelativePath,
  VaultOperationError,
  VaultPort,
} from "../ports/vault-port";

interface HttpBridgeOptions {
  port: number;
  token: string;
  vault: VaultPort;
  tls?: {
    certificate: string;
    privateKey: string;
  };
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class HttpBridge {
  private server: Server | null = null;
  private readonly appendOperations = new Map<
    string,
    { expiresAt: number; payloadHash: string }
  >();

  constructor(private readonly options: HttpBridgeOptions) {}

  async start(): Promise<AddressInfo> {
    if (this.server?.listening) {
      const address = this.server.address();
      if (address && typeof address !== "string") {
        return address;
      }
      throw new Error("HTTP bridge is in an invalid state");
    }

    if (!Number.isInteger(this.options.port) || this.options.port < 0 || this.options.port > 65535) {
      throw new Error("HTTP bridge port must be between 0 and 65535");
    }

    if (this.options.token.trim() === "") {
      throw new Error("HTTP bridge token is required");
    }

    const server = this.options.tls
      ? createHttpsServer(
          {
            cert: this.options.tls.certificate,
            key: this.options.tls.privateKey,
            minVersion: "TLSv1.2",
          },
          (request, response) => {
            void this.handleRequest(request, response);
          },
        )
      : createHttpServer((request, response) => {
      void this.handleRequest(request, response);
        });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.port, "127.0.0.1");
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP bridge address is unavailable");
    }
    return address;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server || !server.listening) {
      this.server = null;
      this.appendOperations.clear();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error instanceof Error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
    this.appendOperations.clear();
  }

  isRunning(): boolean {
    return this.server?.listening === true;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.isAuthorized(request)) {
        this.sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = request.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        this.sendJson(response, 200, { status: "ok" });
        return;
      }

      if (method === "GET" && url.pathname === "/active") {
        const content = await this.options.vault.getActiveFile();
        if (content === null) {
          this.sendText(response, 404, "No active file");
          return;
        }
        this.sendText(response, 200, content);
        return;
      }

      if (method === "GET" && url.pathname === "/list") {
        const directory = url.searchParams.get("directory") ?? "";
        const files = await this.options.vault.listFiles(directory);
        this.sendJson(response, 200, files);
        return;
      }

      if (method === "GET" && url.pathname === "/search") {
        const query = url.searchParams.get("query") ?? "";
        const parsedLimit = Number(url.searchParams.get("limit") ?? "20");
        const limit =
          Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;
        const files = await this.options.vault.searchFiles(query, limit);
        this.sendJson(response, 200, files);
        return;
      }

      if (method === "GET" && url.pathname === "/graph") {
        const relativePath = url.searchParams.get("path") ?? "";
        const direction = url.searchParams.get("direction") ?? "both";
        if (
          direction !== "incoming" &&
          direction !== "outgoing" &&
          direction !== "both"
        ) {
          throw new BridgeHttpError(
            400,
            "direction must be incoming, outgoing, or both",
          );
        }

        const parsedDepth = Number(url.searchParams.get("depth") ?? "1");
        const depth =
          Number.isInteger(parsedDepth) && parsedDepth > 0
            ? Math.min(parsedDepth, 3)
            : 1;
        const parsedLimit = Number(url.searchParams.get("limit") ?? "20");
        const limit =
          Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 100)
            : 20;
        const neighbors = await this.options.vault.getGraphNeighbors(
          relativePath,
          direction,
          depth,
          limit,
        );
        this.sendJson(response, 200, neighbors);
        return;
      }

      if (method === "POST" && url.pathname === "/append") {
        const body = await this.readJsonBody(request);
        if (
          typeof body.path !== "string" ||
          typeof body.content !== "string"
        ) {
          this.sendJson(response, 400, { error: "path and content are required" });
          return;
        }

        const relativePath = normalizeNoteRelativePath(body.path);
        const idempotencyKey = request.headers["idempotency-key"];
        if (
          typeof idempotencyKey === "string" &&
          idempotencyKey.trim().length > 0 &&
          idempotencyKey.length <= 128
        ) {
          const now = Date.now();
          const payloadHash = createHash("sha256")
            .update(JSON.stringify({ path: relativePath, content: body.content }))
            .digest("hex");

          for (const [key, operation] of this.appendOperations) {
            if (operation.expiresAt <= now) {
              this.appendOperations.delete(key);
            }
          }
          const existingOperation = this.appendOperations.get(idempotencyKey);
          if (existingOperation) {
            if (existingOperation.payloadHash !== payloadHash) {
              this.sendJson(response, 409, {
                error: "Idempotency key reused for a different append operation",
              });
              return;
            }
            this.sendJson(response, 200, { success: true, duplicate: true });
            return;
          }
          await this.options.vault.appendFile(relativePath, body.content);
          this.appendOperations.set(idempotencyKey, {
            expiresAt: now + 5 * 60 * 1000,
            payloadHash,
          });
          while (this.appendOperations.size > 1000) {
            const oldestKey = this.appendOperations.keys().next().value;
            if (!oldestKey) {
              break;
            }
            this.appendOperations.delete(oldestKey);
          }
          this.sendJson(response, 200, { success: true });
          return;
        }

        await this.options.vault.appendFile(relativePath, body.content);
        this.sendJson(response, 200, { success: true });
        return;
      }

      if (url.pathname.startsWith("/vault/")) {
        const encodedPath = url.pathname.slice("/vault/".length);
        let decodedPath: string;
        try {
          decodedPath = decodeURIComponent(encodedPath);
        } catch {
          throw new BridgeHttpError(400, "Invalid vault path");
        }
        const path = normalizeNoteRelativePath(decodedPath);

        if (method === "GET") {
          const content = await this.options.vault.readFile(path);
          if (content === null) {
            this.sendText(response, 404, "File not found");
            return;
          }
          this.sendText(response, 200, content);
          return;
        }

        if (method === "PUT") {
          const content = await this.readTextBody(request);
          await this.options.vault.writeFile(path, content);
          this.sendJson(response, 200, { success: true });
          return;
        }

        if (method === "DELETE") {
          const deleted = await this.options.vault.deleteFile(path);
          if (!deleted) {
            this.sendText(response, 404, "File not found");
            return;
          }
          response.statusCode = 204;
          response.end();
          return;
        }
      }

      this.sendJson(response, 404, { error: "Not found" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Internal server error";
      if (error instanceof BridgeHttpError) {
        this.sendJson(response, error.status, { error: message });
        return;
      }
      if (error instanceof VaultOperationError) {
        const status =
          error.code === "directory_not_found"
            ? 404
            : error.code === "folder_exists" || error.code === "cannot_create_folder"
              ? 409
              : 400;
        this.sendJson(response, status, { error: message });
        return;
      }
      if (message.includes("Request body exceeds")) {
        this.sendJson(response, 413, { error: message });
        return;
      }
      this.sendJson(response, 500, { error: message });
    }
  }

  private isAuthorized(request: IncomingMessage): boolean {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      return false;
    }

    const received = createHash("sha256")
      .update(authorization.slice("Bearer ".length))
      .digest();
    const expected = createHash("sha256").update(this.options.token).digest();
    return timingSafeEqual(received, expected);
  }

  private readTextBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      request.on("data", (chunk: unknown) => {
        let buffer: Buffer;
        if (typeof chunk === "string") {
          buffer = Buffer.from(chunk, "utf-8");
        } else if (Buffer.isBuffer(chunk)) {
          buffer = chunk;
        } else {
          reject(new Error("Invalid request body chunk"));
          request.destroy();
          return;
        }
        size += buffer.byteLength;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("Request body exceeds the 5 MB limit"));
          request.destroy();
          return;
        }
        chunks.push(buffer);
      });
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      request.on("error", (error: Error) => reject(error));
    });
  }

  private async readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const text = await this.readTextBody(request);
    if (text === "") {
      return {};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BridgeHttpError(400, "Invalid JSON body");
    }
    if (!isJsonObject(parsed)) {
      throw new BridgeHttpError(400, "JSON body must be an object");
    }
    return parsed;
  }

  private sendText(response: ServerResponse, status: number, text: string): void {
    response.statusCode = status;
    response.setHeader("Content-Type", "text/markdown; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(text);
  }

  private sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(body));
  }
}
