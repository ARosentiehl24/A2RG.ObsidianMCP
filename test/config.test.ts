import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "bun:test";
import {
  discoverObsidianVaultPath,
  loadConfig,
  readObsidianPluginSettings,
} from "../src/config";

test("loadConfig reads HTTPS and vault environment values", () => {
  const keys = [
    "OBSIDIAN_VAULT_PATH",
    "OBSIDIAN_CONFIG_DIR",
    "OBSIDIAN_API_URL",
    "OBSIDIAN_API_KEY",
    "OBSIDIAN_PREFER_REST",
    "OBSIDIAN_TIMEOUT_MS",
    "OBSIDIAN_CA_CERT",
    "OBSIDIAN_ALLOW_INSECURE_HTTP",
  ] as const;
  const previous = new Map(
    keys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/test-vault";
    process.env.OBSIDIAN_CONFIG_DIR = "/tmp/test-vault/.obsidian";
    process.env.OBSIDIAN_API_URL = "https://127.0.0.1:27125";
    process.env.OBSIDIAN_API_KEY = "test-key";
    process.env.OBSIDIAN_PREFER_REST = "true";
    process.env.OBSIDIAN_TIMEOUT_MS = "4321";
    process.env.OBSIDIAN_CA_CERT = "/tmp/test-ca.pem";
    process.env.OBSIDIAN_ALLOW_INSECURE_HTTP = "true";

    const config = loadConfig();
    assert.equal(config.vaultPath, "/tmp/test-vault");
    assert.equal(config.configDirPath, "/tmp/test-vault/.obsidian");
    assert.equal(config.apiUrl, "https://127.0.0.1:27125");
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.preferRestApi, true);
    assert.equal(config.requestTimeoutMs, 4321);
    assert.equal(config.tlsCaCertPath, "/tmp/test-ca.pem");
    assert.equal(config.allowInsecureHttp, true);
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

test("loadConfig rejects relative Obsidian config directories", () => {
  const previous = process.env.OBSIDIAN_CONFIG_DIR;
  try {
    process.env.OBSIDIAN_CONFIG_DIR = "custom-obsidian";
    assert.throws(
      () => loadConfig(),
      /absolute directory path/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.OBSIDIAN_CONFIG_DIR;
    } else {
      process.env.OBSIDIAN_CONFIG_DIR = previous;
    }
  }
});

test("loadConfig discovers a vault and its Obsidian plugin settings", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "a2rg-config-"));
  const vaultPath = path.join(directory, "My Vault");
  const appConfigDir = path.join(directory, "obsidian");
  const pluginDir = path.join(
    vaultPath,
    ".obsidian",
    "plugins",
    "mcp-vault-connector",
  );

  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(appConfigDir, { recursive: true });
  fs.writeFileSync(
    path.join(appConfigDir, "obsidian.json"),
    JSON.stringify({
      vaults: {
        "test-vault": {
          path: vaultPath,
          open: true,
        },
      },
    }),
  );

  const token = "a".repeat(64);
  fs.writeFileSync(
    path.join(pluginDir, "data.json"),
    JSON.stringify({
      enabled: true,
      port: 27125,
      tlsEnabled: true,
      token,
      tlsCertificate: "-----BEGIN CERTIFICATE-----test-----END CERTIFICATE-----",
      tlsFingerprint: "test-fingerprint",
    }),
  );

  const keys = [
    "OBSIDIAN_APP_CONFIG_DIR",
    "OBSIDIAN_VAULT_PATH",
    "OBSIDIAN_CONFIG_DIR",
    "OBSIDIAN_API_URL",
    "OBSIDIAN_API_KEY",
    "OBSIDIAN_PREFER_REST",
    "OBSIDIAN_TIMEOUT_MS",
    "OBSIDIAN_CA_CERT",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      process.env[key] = "";
    }
    process.env.OBSIDIAN_APP_CONFIG_DIR = appConfigDir;

    assert.equal(discoverObsidianVaultPath(), vaultPath);
    assert.equal(
      readObsidianPluginSettings(vaultPath)?.token,
      token,
    );

    const config = loadConfig();
    assert.equal(config.vaultPath, vaultPath);
    assert.equal(config.vaultPathSource, "obsidian-config");
    assert.equal(config.configDirPath, path.join(vaultPath, ".obsidian"));
    assert.equal(config.apiUrl, "https://127.0.0.1:27125");
    assert.equal(config.apiUrlSource, "obsidian-plugin");
    assert.equal(config.apiKey, token);
    assert.equal(
      config.tlsCaCertSource,
      "obsidian-plugin",
    );
    assert.equal(
      config.tlsCaCertPath,
      "-----BEGIN CERTIFICATE-----test-----END CERTIFICATE-----",
    );
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("loadConfig discovers plugin settings from a custom Obsidian config folder", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "a2rg-custom-config-"));
  const vaultPath = path.join(directory, "My Vault");
  const appConfigDir = path.join(directory, "obsidian");
  const customConfigDir = "custom-obsidian";
  const pluginDir = path.join(
    vaultPath,
    customConfigDir,
    "plugins",
    "mcp-vault-connector",
  );

  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(appConfigDir, { recursive: true });
  fs.writeFileSync(
    path.join(appConfigDir, "obsidian.json"),
    JSON.stringify({
      vaults: {
        "test-vault": {
          path: vaultPath,
          open: true,
        },
      },
    }),
  );

  const token = "b".repeat(64);
  fs.writeFileSync(
    path.join(pluginDir, "data.json"),
    JSON.stringify({
      enabled: true,
      port: 27125,
      token,
      configDir: customConfigDir,
    }),
  );

  const keys = [
    "OBSIDIAN_APP_CONFIG_DIR",
    "OBSIDIAN_VAULT_PATH",
    "OBSIDIAN_CONFIG_DIR",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      process.env[key] = "";
    }
    process.env.OBSIDIAN_APP_CONFIG_DIR = appConfigDir;

    const settings = readObsidianPluginSettings(vaultPath);
    assert.equal(settings?.token, token);
    assert.equal(settings?.configDir, customConfigDir);
    assert.equal(
      settings?.configDirPath,
      path.join(vaultPath, customConfigDir),
    );

    const config = loadConfig();
    assert.equal(
      config.configDirPath,
      path.join(vaultPath, customConfigDir),
    );
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
