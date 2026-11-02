import { fileURLToPath } from "node:url";

export interface Config {
  vaultPath: string;
  apiUrl: string;
  apiKey: string;
  preferRestApi: boolean;
  requestTimeoutMs: number;
  tlsCaCertPath: string;
}

export function loadConfig(): Config {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch {
    // .env is optional; process environment remains the source of truth.
  }

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || "/home/a2rg/OneDrive/Obsidian Vault";
  const apiUrl = process.env.OBSIDIAN_API_URL || "http://127.0.0.1:27125";
  let parsedApiUrl: URL;
  try {
    parsedApiUrl = new URL(apiUrl);
  } catch {
    throw new Error("OBSIDIAN_API_URL must be a valid HTTP or HTTPS URL");
  }
  if (
    (parsedApiUrl.protocol !== "http:" && parsedApiUrl.protocol !== "https:")
    || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsedApiUrl.hostname)
  ) {
    throw new Error("OBSIDIAN_API_URL must use a loopback HTTP or HTTPS host");
  }
  const apiKey = process.env.OBSIDIAN_API_KEY || "";
  const preferRestApi = process.env.OBSIDIAN_PREFER_REST !== "false";
  const parsedTimeout = Number.parseInt(
    process.env.OBSIDIAN_TIMEOUT_MS || "3000",
    10,
  );
  const requestTimeoutMs =
    Number.isFinite(parsedTimeout)
      ? Math.min(Math.max(parsedTimeout, 100), 300_000)
      : 3000;
  const tlsCaCertPath = process.env.OBSIDIAN_CA_CERT || "";

  return {
    vaultPath,
    apiUrl,
    apiKey,
    preferRestApi,
    requestTimeoutMs,
    tlsCaCertPath,
  };
}
