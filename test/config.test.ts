import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config";

test("loadConfig reads HTTPS and vault environment values", () => {
  const keys = [
    "OBSIDIAN_VAULT_PATH",
    "OBSIDIAN_API_URL",
    "OBSIDIAN_API_KEY",
    "OBSIDIAN_PREFER_REST",
    "OBSIDIAN_TIMEOUT_MS",
    "OBSIDIAN_CA_CERT",
  ] as const;
  const previous = new Map(
    keys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/test-vault";
    process.env.OBSIDIAN_API_URL = "https://127.0.0.1:27125";
    process.env.OBSIDIAN_API_KEY = "test-key";
    process.env.OBSIDIAN_PREFER_REST = "true";
    process.env.OBSIDIAN_TIMEOUT_MS = "4321";
    process.env.OBSIDIAN_CA_CERT = "/tmp/test-ca.pem";

    const config = loadConfig();
    assert.equal(config.vaultPath, "/tmp/test-vault");
    assert.equal(config.apiUrl, "https://127.0.0.1:27125");
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.preferRestApi, true);
    assert.equal(config.requestTimeoutMs, 4321);
    assert.equal(config.tlsCaCertPath, "/tmp/test-ca.pem");
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("loadConfig clamps request timeout to a bounded range", () => {
  const previous = process.env.OBSIDIAN_TIMEOUT_MS;
  try {
    process.env.OBSIDIAN_TIMEOUT_MS = "1";
    assert.equal(loadConfig().requestTimeoutMs, 100);
    process.env.OBSIDIAN_TIMEOUT_MS = "999999";
    assert.equal(loadConfig().requestTimeoutMs, 300_000);
  } finally {
    if (previous === undefined) {
      delete process.env.OBSIDIAN_TIMEOUT_MS;
    } else {
      process.env.OBSIDIAN_TIMEOUT_MS = previous;
    }
  }
});

test("loadConfig rejects non-loopback API hosts", () => {
  const previous = process.env.OBSIDIAN_API_URL;
  try {
    process.env.OBSIDIAN_API_URL = "https://example.com:27125";
    assert.throws(
      () => loadConfig(),
      /loopback HTTP or HTTPS host/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.OBSIDIAN_API_URL;
    } else {
      process.env.OBSIDIAN_API_URL = previous;
    }
  }
});
