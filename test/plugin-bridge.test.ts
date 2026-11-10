import assert from "node:assert/strict";
import { test } from "bun:test";
import { ApiClient } from "../src/api";
import { HttpBridge } from "../plugin/src/bridge/http-bridge";
import { VaultPort, VaultSearchMatch } from "../plugin/src/ports/vault-port";
import {
  generateLocalTlsCertificate,
  restoreLocalTlsMaterial,
} from "../plugin/src/tls/local-certificate";

class MemoryVault implements VaultPort {
  private files = new Map<string, string>();

  async readFile(relativePath: string): Promise<string | null> {
    return this.files.get(relativePath) ?? null;
  }

  async writeFile(relativePath: string, content: string): Promise<boolean> {
    this.files.set(relativePath, content);
    return true;
  }

  async appendFile(relativePath: string, content: string): Promise<boolean> {
    this.files.set(relativePath, `${this.files.get(relativePath) ?? ""}${content}`);
    return true;
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    return this.files.delete(relativePath);
  }

  async listFiles(): Promise<{ path: string; name: string; isDirectory: boolean }[]> {
    return [...this.files.keys()].map((path) => ({
      path,
      name: path,
      isDirectory: false,
    }));
  }

  async searchFiles(query: string): Promise<VaultSearchMatch[]> {
    const matches: VaultSearchMatch[] = [];
    for (const [path, content] of this.files) {
      if (content.includes(query)) {
        matches.push({ path, matches: [content] });
      }
    }
    return matches;
  }

  async getGraphNeighbors(): Promise<never[]> {
    return [];
  }

  async getActiveFile(): Promise<string | null> {
    return null;
  }
}

test("HttpBridge rejects unauthorized requests and serves authenticated writes", async () => {
  const vault = new MemoryVault();
  const bridge = new HttpBridge({
    port: 0,
    token: "test-token",
    vault,
  });

  const address = await bridge.start();

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(unauthorized.status, 401);

    const headers = {
      Authorization: "Bearer test-token",
      "Content-Type": "text/markdown",
    };

    const write = await fetch(`http://127.0.0.1:${address.port}/vault/notes/example.md`, {
      method: "PUT",
      headers,
      body: "Hello",
    });
    assert.equal(write.status, 200);

    const append = await fetch(`http://127.0.0.1:${address.port}/append`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "test-append-key",
      },
      body: JSON.stringify({ path: "notes/example.md", content: " World" }),
    });
    assert.equal(append.status, 200);

    const duplicateAppend = await fetch(`http://127.0.0.1:${address.port}/append`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": "test-append-key",
      },
      body: JSON.stringify({ path: "notes/example.md", content: " World" }),
    });
    assert.equal(duplicateAppend.status, 200);
    assert.equal((await duplicateAppend.json()).duplicate, true);

    const conflictingAppend = await fetch(`http://127.0.0.1:${address.port}/append`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": "test-append-key",
      },
      body: JSON.stringify({ path: "notes/example.md", content: " Different" }),
    });
    assert.equal(conflictingAppend.status, 409);

    const read = await fetch(`http://127.0.0.1:${address.port}/vault/notes/example.md`, {
      headers: { Authorization: "Bearer test-token" },
    });
    assert.equal(read.status, 200);
    assert.equal(await read.text(), "Hello World");
    const hiddenWrite = await fetch(
      `http://127.0.0.1:${address.port}/vault/.obsidian/plugins/a2rg/data.json`,
      {
        method: "PUT",
        headers,
        body: "{}",
      },
    );
    assert.equal(hiddenWrite.status, 400);

    const extensionWrite = await fetch(
      `http://127.0.0.1:${address.port}/vault/notes/example.json`,
      {
        method: "PUT",
        headers,
        body: "{}",
      },
    );
    assert.equal(extensionWrite.status, 400);

    const absoluteWrite = await fetch(
      `http://127.0.0.1:${address.port}/vault//tmp/example.md`,
      {
        method: "PUT",
        headers,
        body: "no",
      },
    );
    assert.equal(absoluteWrite.status, 400);

    const graph = await fetch(
      `http://127.0.0.1:${address.port}/graph?path=notes/example.md&direction=outgoing&depth=1&limit=20`,
      { headers },
    );
    assert.equal(graph.status, 200);
    assert.deepEqual(await graph.json(), []);
  } finally {
    await bridge.stop();
  }
});

test("HttpBridge exposes the registered tools through Streamable HTTP MCP", async () => {
  const vault = new MemoryVault();
  const bridge = new HttpBridge({
    port: 0,
    token: "test-token",
    vault,
  });

  const address = await bridge.start();
  const headers = {
    Authorization: "Bearer test-token",
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  try {
    const initialize = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "plugin-test",
            version: "1.0.13",
          },
        },
      }),
    });
    assert.equal(initialize.status, 200);
    assert.match(await initialize.text(), /"serverInfo"[\s\S]*"name":"@a2rg\/obsidian-mcp"/);

    const tools = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    assert.equal(tools.status, 200);
    const toolText = await tools.text();
    assert.match(toolText, /get_file/);
    assert.match(toolText, /get_active_file/);

    const write = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "write_file",
          arguments: {
            path: "notes/mcp-http.md",
            content: "Hello MCP HTTP",
          },
        },
      }),
    });
    assert.equal(write.status, 200);
    assert.match(await write.text(), /Archivo guardado exitosamente/);

    const read = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "get_file",
          arguments: {
            path: "notes/mcp-http.md",
          },
        },
      }),
    });
    assert.equal(read.status, 200);
    assert.match(await read.text(), /Hello MCP HTTP/);
  } finally {
    await bridge.stop();
  }
});

test("Persistent TLS material restores only matching certificate and key", async () => {
  const first = await generateLocalTlsCertificate();
  const restored = restoreLocalTlsMaterial(
    first.certificate,
    first.privateKey,
    first.fingerprint,
  );
  assert.equal(restored?.certificate, first.certificate);
  assert.equal(restored?.privateKey, first.privateKey);

  const second = await generateLocalTlsCertificate();
  assert.equal(
    restoreLocalTlsMaterial(
      first.certificate,
      second.privateKey,
      first.fingerprint,
    ),
    null,
  );
});

test("HttpBridge serves HTTPS and ApiClient verifies the generated certificate", async () => {
  const tls = await generateLocalTlsCertificate();
  assert.match(tls.certificate, /BEGIN CERTIFICATE/);
  assert.match(tls.privateKey, /BEGIN (EC )?PRIVATE KEY/);
  const vault = new MemoryVault();
  const bridge = new HttpBridge({
    port: 0,
    token: "test-token",
    vault,
    tls: {
      certificate: tls.certificate,
      privateKey: tls.privateKey,
    },
  });

  const address = await bridge.start();

  try {
    const api = new ApiClient(
      `https://127.0.0.1:${address.port}`,
      "test-token",
      3000,
      tls.certificate,
    );

    assert.equal(await api.isAvailable(), true);

    const untrustedApi = new ApiClient(
      `https://127.0.0.1:${address.port}`,
      "test-token",
      3000,
      "",
    );
    assert.equal(await untrustedApi.isAvailable(), false);
  } finally {
    await bridge.stop();
  }
});
