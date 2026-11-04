#!/usr/bin/env node

import { loadConfig } from "./config.js";

interface CliOptions {
  vaultPath?: string;
  apiUrl?: string;
  apiKey?: string;
  caCert?: string;
  preferRest?: string;
  timeout?: string;
  discoverOnly: boolean;
  help: boolean;
  version: boolean;
}

const PACKAGE_VERSION = "1.0.10";

function usage(): string {
  return `obsidian-mcp ${PACKAGE_VERSION}

Usage:
  obsidian-mcp [options]

Options:
  --vault <path>       Override the Obsidian vault path
  --api-url <url>      Override the loopback plugin API URL
  --api-key <token>    Override the plugin bearer token
  --ca-cert <source>   PEM certificate or local PEM file path
  --prefer-rest <bool> Prefer plugin REST before filesystem fallback
  --timeout <ms>       Request timeout
  --discover           Print discovered configuration without starting MCP
  --version            Print the package version
  --help               Print this help

Environment variables:
  OBSIDIAN_VAULT_PATH
  OBSIDIAN_APP_CONFIG_DIR
  OBSIDIAN_CONFIG_DIR
  OBSIDIAN_API_URL
  OBSIDIAN_API_KEY
  OBSIDIAN_CA_CERT
  OBSIDIAN_PREFER_REST
  OBSIDIAN_TIMEOUT_MS

The server tries the plugin REST endpoint first and falls back to the local
vault filesystem only when the bridge is unavailable.
`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    discoverOnly: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const requireValue = (): string => {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--discover") {
      options.discoverOnly = true;
    } else if (arg === "--vault") {
      options.vaultPath = requireValue();
    } else if (arg === "--api-url") {
      options.apiUrl = requireValue();
    } else if (arg === "--api-key") {
      options.apiKey = requireValue();
    } else if (arg === "--ca-cert") {
      options.caCert = requireValue();
    } else if (arg === "--prefer-rest") {
      options.preferRest = requireValue();
    } else if (arg === "--timeout") {
      options.timeout = requireValue();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function applyOptions(options: CliOptions): void {
  if (options.vaultPath) {
    process.env.OBSIDIAN_VAULT_PATH = options.vaultPath;
  }
  if (options.apiUrl) {
    process.env.OBSIDIAN_API_URL = options.apiUrl;
  }
  if (options.apiKey) {
    process.env.OBSIDIAN_API_KEY = options.apiKey;
  }
  if (options.caCert) {
    process.env.OBSIDIAN_CA_CERT = options.caCert;
  }
  if (options.preferRest) {
    process.env.OBSIDIAN_PREFER_REST = options.preferRest;
  }
  if (options.timeout) {
    process.env.OBSIDIAN_TIMEOUT_MS = options.timeout;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.version) {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }

  applyOptions(options);
  const config = loadConfig();

  if (options.discoverOnly) {
    process.stdout.write(`${JSON.stringify({
      vaultPath: config.vaultPath,
      vaultPathSource: config.vaultPathSource,
      configDirPath: config.configDirPath,
      apiUrl: config.apiUrl,
      apiUrlSource: config.apiUrlSource,
      bearerTokenConfigured: config.apiKey !== "",
      caCertificateConfigured: config.tlsCaCertSource !== "none",
      preferRestApi: config.preferRestApi,
      requestTimeoutMs: config.requestTimeoutMs,
    }, null, 2)}\n`);
    return;
  }

  await import("./index.js");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
