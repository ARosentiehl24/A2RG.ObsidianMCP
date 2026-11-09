import assert from "node:assert/strict";
import http from "node:http";
import { test } from "bun:test";
import { ApiClient } from "../src/api";

test("ApiClient rejects an unreadable TLS CA path", () => {
  assert.throws(
    () =>
      new ApiClient(
        "https://127.0.0.1:27125",
        "test-key",
        300,
        "/definitely/missing/a2rg-ca.pem",
      ),
    /Could not read TLS CA certificate/,
  );
});

test("ApiClient performs authenticated HTTP search and list requests", async () => {
  const server = http.createServer((request, response) => {
    if (request.headers.authorization !== "Bearer test-key") {
      response.writeHead(401);
      response.end();
      return;
    }

    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ status: "ok" }));
    } else if (request.url?.startsWith("/search?")) {
      response.end(JSON.stringify([
        { path: "notes/test.md", matches: ["test"] },
      ]));
    } else if (request.url?.startsWith("/list")) {
      response.end(JSON.stringify([
        { path: "notes/test.md", name: "test.md", isDirectory: false },
      ]));
    } else if (request.url === "/vault/oversized.md") {
      response.setHeader("Content-Type", "text/markdown");
      response.end("x".repeat(5 * 1024 * 1024 + 1));
    } else {
      response.writeHead(404);
      response.end();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }

    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "test-key",
      1000,
      "",
      true,
    );
    assert.equal(await api.isAvailable(), true);

    const search = await api.search("test", 10);
    assert.equal(search.ok, true);
    assert.equal(search.data?.[0]?.path, "notes/test.md");

    const list = await api.listFiles("");
    assert.equal(list.ok, true);
    assert.equal(list.data?.[0]?.name, "test.md");

    const oversized = await api.getFile("oversized.md");
    assert.equal(oversized.ok, false);
    assert.equal(
      oversized.error,
      "Response exceeds the 5 MB limit",
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("ApiClient refuses plain HTTP unless explicitly allowed", async () => {
  let requestCount = 0;
  const server = http.createServer((_request, response) => {
    requestCount += 1;
    response.end(JSON.stringify({ status: "ok" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }
    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "secret-token",
      100,
    );
    const response = await api.putFile("notes/private.md", "private content");

    assert.equal(response.ok, false);
    assert.equal(response.status, 0);
    assert.match(response.error ?? "", /Refusing HTTP transport/);
    assert.equal(requestCount, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("ApiClient marks timed-out append operations as ambiguous", async () => {
  const server = http.createServer((_request, response) => {
    setTimeout(() => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ success: true }));
    }, 150);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }

    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "test-key",
      50,
      "",
      true,
    );
    const response = await api.appendFile("notes/example.md", " World");
    assert.equal(response.ok, false);
    assert.equal(response.status, 0);
    assert.equal(response.ambiguous, true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
