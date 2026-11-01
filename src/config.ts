export interface Config {
  vaultPath: string;
  apiUrl: string;
  apiKey: string;
  preferRestApi: boolean;
  requestTimeoutMs: number;
}

export function loadConfig(): Config {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH || "/home/a2rg/OneDrive/Obsidian Vault";
  const apiUrl = process.env.OBSIDIAN_API_URL || "https://127.0.0.1:27124";
  const apiKey = process.env.OBSIDIAN_API_KEY || "";
  const preferRestApi = process.env.OBSIDIAN_PREFER_REST !== "false";
  const requestTimeoutMs = parseInt(process.env.OBSIDIAN_TIMEOUT_MS || "3000", 10);

  return {
    vaultPath,
    apiUrl,
    apiKey,
    preferRestApi,
    requestTimeoutMs,
  };
}
