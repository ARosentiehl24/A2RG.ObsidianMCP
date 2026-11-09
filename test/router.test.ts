import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";
import { ApiClient } from "../src/api";
import { HybridRouter } from "../src/router";
import { VaultManager } from "../src/vault";

test("HybridRouter falls back to the filesystem when the bridge is unavailable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-router-"));

  try {
    const vault = new VaultManager(directory);
    await vault.writeFile("fallback.md", "Start");

    const api = new ApiClient("http://127.0.0.1:1", "", 50);
    const router = new HybridRouter(api, vault, true);

    const read = await router.getFile("fallback.md");
    assert.equal(read.source, "filesystem");
    assert.equal(read.content, "Start");

    await router.appendFile("fallback.md", " middle");
    assert.equal((await router.getFile("fallback.md")).content, "Start middle");

    await router.writeFile("second.md", "Second");
    const matches = await router.search("second");
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.path, "second.md");

    await router.deleteFile("second.md");
    await assert.rejects(() => vault.readFile("second.md"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HybridRouter does not fall back after definite HTTP authorization failures", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-router-auth-"));
  const server = http.createServer((_request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Unauthorized" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server address unavailable");
    }

    const vault = new VaultManager(directory);
    await vault.writeFile("protected.md", "Original");
    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "wrong-token",
      50,
      "",
      true,
    );
    const router = new HybridRouter(api, vault, true);

    await assert.rejects(
      () => router.getFile("protected.md"),
      /HTTP error 401/,
    );
    await assert.rejects(
      () => router.writeFile("protected.md", "Changed"),
      /HTTP error 401/,
    );
    await assert.rejects(
      () => router.deleteFile("protected.md"),
      /HTTP error 401/,
    );
    assert.equal(await vault.readFile("protected.md"), "Original");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("HybridRouter skips filesystem append after a REST timeout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-router-append-"));
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

    const vault = new VaultManager(directory);
    await vault.writeFile("fallback.md", "Start");

    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "",
      50,
      "",
      true,
    );
    const router = new HybridRouter(api, vault, true);

    await assert.rejects(
      () => router.appendFile("fallback.md", " middle"),
      /Append status is unknown/,
    );
    assert.equal(await vault.readFile("fallback.md"), "Start");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("HybridRouter skips filesystem fallback for ambiguous write and delete", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-router-mutation-"));
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

    const vault = new VaultManager(directory);
    await vault.writeFile("mutation.md", "Original");
    const api = new ApiClient(
      `http://127.0.0.1:${address.port}`,
      "",
      50,
      "",
      true,
    );
    const router = new HybridRouter(api, vault, true);

    await assert.rejects(
      () => router.writeFile("mutation.md", "Changed"),
      /Write status is unknown/,
    );
    await assert.rejects(
      () => router.deleteFile("mutation.md"),
      /Delete status is unknown/,
    );
    assert.equal(await vault.readFile("mutation.md"), "Original");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
