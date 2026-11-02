import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type A2rgMcpBridgePlugin from "./main";

export interface BridgeSettings {
  enabled: boolean;
  port: number;
  token: string;
  tlsEnabled: boolean;
  tlsCertificatePath: string;
  tlsPrivateKeyPath: string;
  tlsFingerprint: string;
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  enabled: true,
  port: 27125,
  token: "",
  tlsEnabled: false,
  tlsCertificatePath: "",
  tlsPrivateKeyPath: "",
  tlsFingerprint: "",
};

export class A2rgBridgeSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: A2rgMcpBridgePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "A2RG MCP Bridge" });
    containerEl.createEl("p", {
      text: "Connect MCP clients to the currently open Obsidian vault.",
    });

    containerEl.createEl("h3", { text: "Status" });

    const running = this.plugin.isBridgeRunning();
    new Setting(containerEl)
      .setName(running ? "Bridge is running" : "Bridge is stopped")
      .setDesc(
        running
          ? `Listening locally on ${this.plugin.getBridgeUrl()}`
          : "Start the bridge to accept MCP requests.",
      )
      .addButton((button) =>
        button
          .setButtonText(running ? "Stop" : "Start")
          .setCta()
          .onClick(async () => {
            if (running) {
              await this.plugin.stopBridge();
            } else {
              await this.plugin.startBridge();
            }
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Local address")
      .setDesc(this.plugin.getBridgeUrl())
      .addExtraButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy bridge URL")
          .onClick(async () => {
            await this.copyToClipboard(
              this.plugin.getBridgeUrl(),
              "Bridge URL",
            );
          }),
      );

    containerEl.createEl("h3", { text: "Connection" });

    new Setting(containerEl)
      .setName("Enable bridge")
      .setDesc("Start the local HTTP or HTTPS bridge while Obsidian is running.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (enabled) => {
            this.plugin.settings.enabled = enabled;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Use local HTTPS")
      .setDesc("Generate a certificate and serve HTTPS on loopback.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.isTlsEnabled())
          .onChange(async (enabled) => {
            this.plugin.settings.tlsEnabled = enabled;
            if (enabled) {
              try {
                await this.plugin.generateTlsCertificate();
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                new Notice(`Could not generate the local certificate: ${message}`);
              }
            } else {
              await this.plugin.saveSettings();
            }
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("Loopback port. Default: 27125.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "65535";
        text
          .setPlaceholder("27125")
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = Number(value);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
              return;
            }
            this.plugin.settings.port = port;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    containerEl.createEl("h3", { text: "Authentication" });

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc("Copy this value to OBSIDIAN_API_KEY in the MCP environment.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("Generated automatically")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            if (/^[0-9a-f]{64}$/i.test(value.trim())) {
              await this.plugin.setToken(value);
            }
          });
      })
      .addExtraButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy bearer token")
          .onClick(async () => {
            await this.copyToClipboard(
              this.plugin.settings.token,
              "Bearer token",
            );
          }),
      )
      .addExtraButton((button) =>
        button
          .setIcon("refresh-cw")
          .setTooltip("Generate a new bearer token")
          .onClick(async () => {
            await this.plugin.generateToken();
            this.display();
          }),
      );

    containerEl.createEl("h3", { text: "MCP setup" });

    if (this.plugin.isTlsEnabled()) {
      new Setting(containerEl)
        .setName("Local certificate")
        .setDesc(
          this.plugin.getTlsFingerprint()
            ? `SHA-256: ${this.plugin.getTlsFingerprint()}`
            : "Not generated",
        )
        .addExtraButton((button) =>
          button
            .setIcon("copy")
            .setTooltip("Copy CA certificate path")
            .onClick(async () => {
              await this.copyToClipboard(
                this.plugin.getTlsCertificatePath(),
                "CA certificate path",
              );
            }),
        )
        .addExtraButton((button) =>
          button
            .setIcon("copy")
            .setTooltip("Copy public certificate")
            .onClick(async () => {
              try {
                const certificate = await this.plugin.readTlsCertificate();
                await this.copyToClipboard(
                  certificate,
                  "Local certificate",
                );
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                new Notice(`Could not copy the certificate: ${message}`);
              }
            }),
        )
        .addExtraButton((button) =>
          button
            .setIcon("refresh-cw")
            .setTooltip("Generate a replacement certificate")
            .onClick(async () => {
              await this.plugin.generateTlsCertificate();
              this.display();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Copy environment variables")
      .setDesc("Copies the URL, bearer token, CA certificate, and bridge preferences.")
      .addExtraButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy MCP environment")
          .onClick(async () => {
            const environment = [
              `OBSIDIAN_API_URL=${this.plugin.getBridgeUrl()}`,
              `OBSIDIAN_API_KEY=${this.plugin.settings.token}`,
              "OBSIDIAN_PREFER_REST=true",
              "OBSIDIAN_TIMEOUT_MS=3000",
              ...(this.plugin.isTlsEnabled()
                ? [
                    `OBSIDIAN_CA_CERT=${this.plugin.getTlsCertificatePath()}`,
                  ]
                : []),
            ].join("\n");
            await this.copyToClipboard(
              environment,
              "MCP environment",
            );
          }),
      );

    new Setting(containerEl)
      .setName("Health check")
      .setDesc("Copy an authenticated curl command for the running bridge.")
      .addExtraButton((button) =>
        button
          .setIcon("copy")
          .setTooltip("Copy health check command")
          .onClick(async () => {
            const caOption =
              this.plugin.isTlsEnabled() &&
              this.plugin.getTlsCertificatePath()
                ? ` --cacert "${this.plugin.getTlsCertificatePath()}"`
                : "";
            const command = `curl --fail --silent${caOption} -H "Authorization: Bearer ${this.plugin.settings.token}" ${this.plugin.getBridgeUrl()}/health`;
            await this.copyToClipboard(command, "Health check command");
          }),
      );

    containerEl.createEl("h3", { text: "Security" });

    containerEl.createEl("p", {
      text: "The bridge listens only on 127.0.0.1. The bearer token and private key stay outside the vault.",
    });
    containerEl.createEl("p", {
      text: "Keep the bearer token private. It grants read and write access to the open vault.",
    });
  }

  private async copyToClipboard(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      new Notice(`${label} copied.`);
    } catch {
      new Notice(`Could not copy ${label}.`);
    }
  }
}
