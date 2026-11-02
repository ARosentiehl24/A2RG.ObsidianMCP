import path from "node:path";
import { Notice, Plugin, FileSystemAdapter } from "obsidian";
import { randomBytes } from "node:crypto";
import { ObsidianVaultAdapter } from "./adapters/obsidian-vault-adapter";
import { HttpBridge } from "./bridge/http-bridge";
import {
  A2rgBridgeSettingTab,
  BridgeSettings,
  DEFAULT_SETTINGS,
  sanitizeBridgeSettings,
} from "./settings";
import {
  generateLocalTlsCertificate,
  readLocalTlsMaterial,
  LocalTlsMaterial,
} from "./tls/local-certificate";
import { SecureConfigStore } from "./services/secure-config-store";

export default class A2rgMcpBridgePlugin extends Plugin {
  settings: BridgeSettings = { ...DEFAULT_SETTINGS };
  private bridge: HttpBridge | null = null;
  private vaultAdapter: ObsidianVaultAdapter | null = null;
  private readonly secureConfig = new SecureConfigStore();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.settings.token = await this.secureConfig.ensureToken(
      () => randomBytes(32).toString("hex"),
    );
    await this.securePluginFiles();

    this.addSettingTab(new A2rgBridgeSettingTab(this.app, this));
    this.addCommand({
      id: "start-mcp-bridge",
      name: "Start MCP bridge",
      callback: () => {
        void this.startBridge();
      },
    });
    this.addCommand({
      id: "stop-mcp-bridge",
      name: "Stop MCP bridge",
      callback: () => {
        void this.stopBridge();
      },
    });
    this.addCommand({
      id: "show-mcp-bridge-status",
      name: "Show MCP bridge status",
      callback: () => {
        new Notice(
          this.bridge?.isRunning()
            ? `A2RG MCP bridge running on 127.0.0.1:${this.settings.port}`
            : "A2RG MCP bridge is stopped",
        );
      },
    });

    if (this.settings.enabled) {
      await this.startBridge();
    }
  }

  onunload(): void {
    void this.stopBridge();
  }

  async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    this.settings = sanitizeBridgeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, token: "" });
    await this.securePluginFiles();
    await this.restartBridge();
  }

  async generateToken(): Promise<void> {
    this.settings.token = randomBytes(32).toString("hex");
    await this.secureConfig.writeToken(this.settings.token);
    await this.saveSettings();
  }

  async setToken(token: string): Promise<void> {
    const normalized = token.trim();
    if (!/^[0-9a-f]{64}$/i.test(normalized)) {
      throw new Error("Bearer token must be 64 hexadecimal characters");
    }
    await this.secureConfig.writeToken(normalized);
    this.settings.token = normalized;
    await this.saveSettings();
  }

  isBridgeRunning(): boolean {
    return this.bridge?.isRunning() === true;
  }

  getBridgeUrl(): string {
    const protocol = this.settings.tlsEnabled ? "https" : "http";
    return `${protocol}://127.0.0.1:${this.settings.port}`;
  }

  isTlsEnabled(): boolean {
    return this.settings.tlsEnabled;
  }

  getTlsCertificatePath(): string {
    return this.settings.tlsCertificatePath;
  }

  getTlsFingerprint(): string {
    return this.settings.tlsFingerprint;
  }

  getConfigDirPath(): string | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    return path.join(
      adapter.getBasePath(),
      this.app.vault.configDir,
    );
  }

  async generateTlsCertificate(): Promise<void> {
    const tlsDirectory = this.getTlsDirectory();
    if (!tlsDirectory) {
      throw new Error("TLS certificates require a local filesystem vault");
    }

    const material = await generateLocalTlsCertificate(tlsDirectory);
    this.settings.tlsCertificatePath = material.certificatePath;
    this.settings.tlsPrivateKeyPath = material.privateKeyPath;
    this.settings.tlsFingerprint = material.fingerprint;
    await this.saveSettings();
  }

  async readTlsCertificate(): Promise<string> {
    if (!this.settings.tlsCertificatePath) {
      throw new Error("No local TLS certificate is configured");
    }

    const material = await readLocalTlsMaterial(
      this.settings.tlsCertificatePath,
      this.settings.tlsPrivateKeyPath,
      this.settings.tlsFingerprint,
    );
    return material.certificate;
  }

  async startBridge(): Promise<void> {
    await this.stopBridge();
    if (!this.settings.enabled) {
      return;
    }

    const securityWarnings = await this.securePluginFiles();
    if (securityWarnings.length > 0) {
      new Notice(
        `A2RG MCP bridge not started: insecure plugin permissions (${securityWarnings.join(", ")}).`,
      );
      return;
    }

    const vault = new ObsidianVaultAdapter(
      this.app,
      this,
      this.getSearchCachePath() ?? undefined,
    );
    this.vaultAdapter = vault;
    vault.startIndexing();

    let tls: { certificate: string; privateKey: string } | undefined;
    if (this.settings.tlsEnabled) {
      try {
        const material = await this.ensureTlsMaterial();
        tls = {
          certificate: material.certificate,
          privateKey: material.privateKey,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Could not load the local TLS certificate: ${message}`);
        return;
      }
    }

    this.bridge = new HttpBridge({
      port: this.settings.port,
      token: this.settings.token,
      vault,
      tls,
    });

    try {
      const address = await this.bridge.start();
      new Notice(`A2RG MCP bridge running on 127.0.0.1:${address.port}`);
    } catch (error: unknown) {
      this.bridge = null;
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not start A2RG MCP bridge: ${message}`);
    }
  }

  async stopBridge(): Promise<void> {
    if (this.bridge !== null) {
      await this.bridge.stop();
      this.bridge = null;
    }
    if (this.vaultAdapter !== null) {
      await this.vaultAdapter.flushSearchCache();
      this.vaultAdapter = null;
    }
  }

  private async restartBridge(): Promise<void> {
    if (!this.settings.enabled) {
      await this.stopBridge();
      return;
    }
    await this.startBridge();
  }

  private getSearchCachePath(): string | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    if (!this.manifest.dir) {
      return null;
    }
    return path.join(
      adapter.getBasePath(),
      this.manifest.dir,
      "cache",
      "search-index-v1.json",
    );
  }

  private getTlsDirectory(): string {
    return this.secureConfig.getTlsDirectory();
  }

  private async ensureTlsMaterial(): Promise<LocalTlsMaterial> {
    const secureDirectory = this.secureConfig.getDirectory();
    const certificateIsSecure =
      this.settings.tlsCertificatePath &&
      this.secureConfig.isWithinDirectory(
        this.settings.tlsCertificatePath,
        secureDirectory,
      );
    const privateKeyIsSecure =
      this.settings.tlsPrivateKeyPath &&
      this.secureConfig.isWithinDirectory(
        this.settings.tlsPrivateKeyPath,
        secureDirectory,
      );

    if (certificateIsSecure && privateKeyIsSecure) {
      try {
        return await readLocalTlsMaterial(
          this.settings.tlsCertificatePath,
          this.settings.tlsPrivateKeyPath,
          this.settings.tlsFingerprint,
        );
      } catch {
        // Generate a replacement certificate below.
      }
    }

    const tlsDirectory = this.getTlsDirectory();
    const material = await generateLocalTlsCertificate(tlsDirectory);
    this.settings.tlsCertificatePath = material.certificatePath;
    this.settings.tlsPrivateKeyPath = material.privateKeyPath;
    this.settings.tlsFingerprint = material.fingerprint;
    await this.saveData({ ...this.settings, token: "" });
    await this.securePluginFiles();
    return material;
  }

  private async securePluginFiles(): Promise<string[]> {
    return this.secureConfig.secureSecrets(
      this.settings.tlsPrivateKeyPath,
    );
  }
}
