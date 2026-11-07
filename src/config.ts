import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Config {
  vaultPath: string;
  vaultPathSource: "env" | "obsidian-config" | "none";
  configDirPath: string;
  apiUrl: string;
  apiUrlSource: "env" | "obsidian-plugin" | "default";
  apiKey: string;
  tlsCaCertSource: "env" | "obsidian-plugin" | "none";
  preferRestApi: boolean;
  requestTimeoutMs: number;
  tlsCaCertPath: string;
  allowInsecureHttp: boolean;
}

export interface ObsidianPluginSettings {
  enabled?: boolean;
  port?: number;
  tlsEnabled?: boolean;
  allowInsecureHttp?: boolean;
  token?: string;
  tlsCertificate?: string;
  tlsFingerprint?: string;
  configDir?: string;
  configDirPath?: string;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function getObsidianAppConfigDirs(): string[] {
  const explicit = process.env.OBSIDIAN_APP_CONFIG_DIR?.trim();
  if (explicit) {
    return [explicit];
  }

  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      process.env.APPDATA
        ? path.join(process.env.APPDATA, "obsidian")
        : path.join(home, "AppData", "Roaming", "obsidian"),
    ];
  }
  if (process.platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "obsidian"),
    ];
  }

  return [
    process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, "obsidian")
      : path.join(home, ".config", "obsidian"),
    path.join(home, ".var", "app", "md.obsidian.Obsidian", "config", "obsidian"),
  ];
}

function isExistingDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

export function readObsidianPluginSettings(
  vaultPath: string,
): ObsidianPluginSettings | null {
  if (!vaultPath || !isExistingDirectory(vaultPath)) {
    return null;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(vaultPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const discoveredConfigDirPath = path.join(vaultPath, entry.name);
    const settingsPath = path.join(
      discoveredConfigDirPath,
      "plugins",
      "mcp-vault-connector",
      "data.json",
    );
    const data = readJsonObject(settingsPath);
    if (!data) {
      continue;
    }

    const recordedConfigDir =
      typeof data.configDir === "string" ? data.configDir.trim() : "";
    let configDirPath = discoveredConfigDirPath;
    if (recordedConfigDir && !path.isAbsolute(recordedConfigDir)) {
      const recordedPath = path.resolve(vaultPath, recordedConfigDir);
      const relative = path.relative(vaultPath, recordedPath);
      if (
        relative !== ".."
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
      ) {
        configDirPath = recordedPath;
      }
    }

    return {
      enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
      port:
        typeof data.port === "number" && Number.isInteger(data.port)
        && data.port >= 1
        && data.port <= 65535
          ? data.port
          : undefined,
      tlsEnabled:
        typeof data.tlsEnabled === "boolean" ? data.tlsEnabled : undefined,
      allowInsecureHttp:
        typeof data.allowInsecureHttp === "boolean"
          ? data.allowInsecureHttp
          : undefined,
      token:
        typeof data.token === "string" && /^[0-9a-f]{64}$/i.test(data.token)
          ? data.token
          : undefined,
      tlsCertificate:
        typeof data.tlsCertificate === "string"
        && data.tlsCertificate.includes("BEGIN CERTIFICATE")
          ? data.tlsCertificate
          : undefined,
      tlsFingerprint:
        typeof data.tlsFingerprint === "string" ? data.tlsFingerprint : undefined,
      configDir: recordedConfigDir,
      configDirPath,
    };
  }

  return null;
}

export function discoverObsidianVaultPath(): string {
  for (const configDir of getObsidianAppConfigDirs()) {
    const appConfig = readJsonObject(path.join(configDir, "obsidian.json"));
    if (
      !appConfig
      || typeof appConfig.vaults !== "object"
      || appConfig.vaults === null
    ) {
      continue;
    }

    const candidates: Array<{ path: string; open: boolean }> = [];
    for (const value of Object.values(
      appConfig.vaults as Record<string, unknown>,
    )) {
      if (typeof value !== "object" || value === null) {
        continue;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.path !== "string") {
        continue;
      }
      const vaultPath = path.resolve(record.path);
      if (!isExistingDirectory(vaultPath)) {
        continue;
      }
      candidates.push({
        path: vaultPath,
        open: record.open === true,
      });
    }

    const openCandidates = candidates.filter((candidate) => candidate.open);
    if (openCandidates.length === 1) {
      return openCandidates[0]?.path ?? "";
    }

    const pluginCandidates = openCandidates.filter((candidate) => {
      const settings = readObsidianPluginSettings(candidate.path);
      return settings?.enabled === true && Boolean(settings.token);
    });
    if (pluginCandidates.length === 1) {
      return pluginCandidates[0]?.path ?? "";
    }

    if (candidates.length === 1) {
      return candidates[0]?.path ?? "";
    }
  }

  return "";
}

export function loadConfig(): Config {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env"));
  } catch {
    // .env is optional; process environment remains the source of truth.
  }

  const envVaultPath = process.env.OBSIDIAN_VAULT_PATH?.trim();
  let vaultPath = "";
  let vaultPathSource: Config["vaultPathSource"] = "none";
  if (envVaultPath) {
    if (!path.isAbsolute(envVaultPath)) {
      throw new Error("OBSIDIAN_VAULT_PATH must be an absolute directory");
    }
    vaultPath = path.resolve(envVaultPath);
    vaultPathSource = "env";
  } else {
    vaultPath = discoverObsidianVaultPath();
    if (vaultPath) {
      vaultPathSource = "obsidian-config";
    }
  }

  const explicitConfigDir = process.env.OBSIDIAN_CONFIG_DIR?.trim();
  if (explicitConfigDir && !path.isAbsolute(explicitConfigDir)) {
    throw new Error("OBSIDIAN_CONFIG_DIR must be an absolute directory path");
  }
  const pluginSettings = vaultPath
    ? readObsidianPluginSettings(vaultPath)
    : null;
  const configDirPath = explicitConfigDir
    || pluginSettings?.configDirPath
    || "";

  let apiUrl = "http://127.0.0.1:27125";
  let apiUrlSource: Config["apiUrlSource"] = "default";
  if (process.env.OBSIDIAN_API_URL?.trim()) {
    apiUrl = process.env.OBSIDIAN_API_URL.trim();
    apiUrlSource = "env";
  } else if (pluginSettings) {
    const port = pluginSettings.port ?? 27125;
    apiUrl = `${pluginSettings.tlsEnabled ? "https" : "http"}://127.0.0.1:${port}`;
    apiUrlSource = "obsidian-plugin";
  }

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

  const apiKey = process.env.OBSIDIAN_API_KEY?.trim()
    || pluginSettings?.token
    || "";
  const preferRestApi = process.env.OBSIDIAN_PREFER_REST !== "false";
  const parsedTimeout = Number.parseInt(
    process.env.OBSIDIAN_TIMEOUT_MS || "3000",
    10,
  );
  const requestTimeoutMs =
    Number.isFinite(parsedTimeout)
      ? Math.min(Math.max(parsedTimeout, 100), 300_000)
      : 3000;
  const configuredInsecureHttp =
    process.env.OBSIDIAN_ALLOW_INSECURE_HTTP?.trim();
  const allowInsecureHttp = configuredInsecureHttp
    ? configuredInsecureHttp === "true"
    : pluginSettings?.allowInsecureHttp === true;

  let tlsCaCertPath = process.env.OBSIDIAN_CA_CERT?.trim() || "";
  let tlsCaCertSource: Config["tlsCaCertSource"] =
    tlsCaCertPath ? "env" : "none";
  if (!tlsCaCertPath && pluginSettings?.tlsCertificate) {
    tlsCaCertPath = pluginSettings.tlsCertificate;
    tlsCaCertSource = "obsidian-plugin";
  }

  return {
    vaultPath,
    vaultPathSource,
    configDirPath,
    apiUrl,
    apiUrlSource,
    apiKey,
    tlsCaCertSource,
    preferRestApi,
    requestTimeoutMs,
    tlsCaCertPath,
    allowInsecureHttp,
  };
}
