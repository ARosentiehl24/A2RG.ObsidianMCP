import { Notice, Plugin } from "obsidian";
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
  LocalTlsMaterial,
  restoreLocalTlsMaterial,
} from "./tls/local-certificate";

export default class A2rgMcpBridgePlugin extends Plugin {
  settings: BridgeSettings = { ...DEFAULT_SETTINGS };
  private bridge: HttpBridge | null = null;
  private vaultAdapter: ObsidianVaultAdapter | null = null;
  private tlsMaterial: LocalTlsMaterial | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    const configDir = this.app.vault.configDir;
    if (this.settings.configDir !== configDir) {
      this.settings.configDir = configDir;
      await this.saveData({ ...this.settings });
    }
    if (!/^[0-9a-f]{64}$/i.test(this.settings.token)) {
      this.settings.token = randomBytes(32).toString("hex");
      await this.saveData({ ...this.settings });
    }

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

    this.addSettingTab(new A2rgBridgeSettingTab(this.app, this));
  }

  onunload(): void {
    void this.stopBridge();
  }

  async loadSettings(): Promise<void> {
    const loaded: unknown = await this.loadData();
    this.settings = sanitizeBridgeSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings });
    await this.restartBridge();
  }

  async generateToken(): Promise<void> {
    this.settings.token = randomBytes(32).toString("hex");
    await this.saveSettings();
  }

  async setToken(token: string): Promise<void> {
    const normalized = token.trim();
    if (!/^[0-9a-f]{64}$/i.test(normalized)) {
      throw new Error("Bearer token must be 64 hexadecimal characters");
    }
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

  getMcpUrl(): string {
    return `${this.getBridgeUrl()}/mcp`;
  }

  isTlsEnabled(): boolean {
    return this.settings.tlsEnabled;
  }

  getTlsCertificate(): string {
    return this.settings.tlsCertificate;
  }

  getTlsFingerprint(): string {
    return this.settings.tlsFingerprint;
  }

  async generateTlsCertificate(): Promise<void> {
    const material = await generateLocalTlsCertificate();
    this.tlsMaterial = material;
    this.settings.tlsCertificate = material.certificate;
    this.settings.tlsFingerprint = material.fingerprint;
    this.settings.tlsPrivateKey = material.privateKey;
    await this.saveSettings();
    new Notice(
      "Local TLS certificate regenerated. Re-trust the certificate in MCP clients.",
    );
  }

  async ensureTlsCertificate(): Promise<void> {
    await this.ensureTlsMaterial();
  }

  async readTlsCertificate(): Promise<string> {
    if (this.settings.tlsCertificate) {
      return this.settings.tlsCertificate;
    }
    throw new Error("No local TLS certificate is configured");
  }

  async startBridge(): Promise<void> {
    await this.stopBridge();
    if (!this.settings.enabled) {
      return;
    }
    if (!this.settings.tlsEnabled && !this.settings.allowInsecureHttp) {
      new Notice(
        "Bridge blocked: enable local HTTPS or explicitly allow insecure HTTP for testing.",
      );
      return;
    }

    const vault = new ObsidianVaultAdapter(this.app, this);
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

  private async ensureTlsMaterial(): Promise<LocalTlsMaterial> {
    if (this.tlsMaterial) {
      return this.tlsMaterial;
    }
    const restored = restoreLocalTlsMaterial(
      this.settings.tlsCertificate,
      this.settings.tlsPrivateKey,
      this.settings.tlsFingerprint,
    );
    if (restored) {
      this.tlsMaterial = restored;
      return restored;
    }
    const material = await generateLocalTlsCertificate();
    this.tlsMaterial = material;
    this.settings.tlsCertificate = material.certificate;
    this.settings.tlsFingerprint = material.fingerprint;
    this.settings.tlsPrivateKey = material.privateKey;
    await this.saveData({ ...this.settings });
    return material;
  }
}
