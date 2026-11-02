import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
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

  getSettingDefinitions(): SettingDefinitionItem[] {
    const running = this.plugin.isBridgeRunning();

    return [
      {
        type: "group",
        heading: "Status",
        items: [
          {
            name: running ? "Bridge is running" : "Bridge is stopped",
            desc: running
              ? `Listening locally on ${this.plugin.getBridgeUrl()}`
              : "Start the bridge to accept MCP requests.",
            action: () => {
              void (async () => {
                if (running) {
                  await this.plugin.stopBridge();
                } else {
                  await this.plugin.startBridge();
                }
                this.update();
              })();
            },
          },
          {
            name: "Local address",
            desc: this.plugin.getBridgeUrl(),
            action: () => {
              void this.copyToClipboard(
                this.plugin.getBridgeUrl(),
                "Bridge URL",
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Connection",
        items: [
          {
            name: "Enable bridge",
            desc: "Start the local HTTP or HTTPS bridge while Obsidian is running.",
            control: {
              type: "toggle",
              key: "enabled",
              defaultValue: false,
            },
          },
          {
            name: "Use local HTTPS",
            desc: "Generate a certificate and serve HTTPS on loopback.",
            control: {
              type: "toggle",
              key: "tlsEnabled",
              defaultValue: false,
            },
          },
          {
            name: "Port",
            desc: "Loopback port. Default: 27125.",
            control: {
              type: "number",
              key: "port",
              defaultValue: 27125,
              min: 1,
              max: 65535,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Authentication",
        items: [
          {
            name: "Bearer token",
            desc: "Copy this value to OBSIDIAN_API_KEY in the MCP environment.",
            control: {
              type: "text",
              key: "token",
              defaultValue: "",
              placeholder: "Generated automatically",
              validate: (value: string) =>
                /^[0-9a-f]{64}$/i.test(value.trim())
                  ? undefined
                  : "Bearer token must be 64 hexadecimal characters",
            },
          },
          {
            name: "Generate a new bearer token",
            action: () => {
              void this.plugin.generateToken().then(() => this.update());
            },
          },
        ],
      },
      {
        type: "group",
        heading: "MCP setup",
        items: [
          {
            name: "Copy environment variables",
            desc: "Copies the URL, bearer token, CA certificate, and bridge preferences.",
            action: () => {
              const environment = [
                `OBSIDIAN_API_URL=${this.plugin.getBridgeUrl()}`,
                `OBSIDIAN_API_KEY=${this.plugin.settings.token}`,
                "OBSIDIAN_PREFER_REST=true",
                "OBSIDIAN_TIMEOUT_MS=3000",
                ...(this.plugin.getConfigDirPath()
                  ? [`OBSIDIAN_CONFIG_DIR=${this.plugin.getConfigDirPath()}`]
                  : []),
                ...(this.plugin.isTlsEnabled()
                  ? [`OBSIDIAN_CA_CERT=${this.plugin.getTlsCertificatePath()}`]
                  : []),
              ].join("\n");
              void this.copyToClipboard(environment, "MCP environment");
            },
          },
          {
            name: "Health check",
            desc: "Copy an authenticated curl command for the running bridge.",
            action: () => {
              const caOption =
                this.plugin.isTlsEnabled() &&
                this.plugin.getTlsCertificatePath()
                  ? ` --cacert "${this.plugin.getTlsCertificatePath()}"`
                  : "";
              const command = `curl --fail --silent${caOption} -H "Authorization: ******" ${this.plugin.getBridgeUrl()}/health`;
              void this.copyToClipboard(command, "Health check command");
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    switch (key) {
      case "enabled":
        return this.plugin.settings.enabled;
      case "tlsEnabled":
        return this.plugin.settings.tlsEnabled;
      case "port":
        return this.plugin.settings.port;
      case "token":
        return this.plugin.settings.token;
      default:
        return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "enabled":
        if (typeof value === "boolean") {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }
        break;
      case "tlsEnabled":
        if (typeof value === "boolean") {
          this.plugin.settings.tlsEnabled = value;
          if (value) {
            await this.plugin.generateTlsCertificate();
          } else {
            await this.plugin.saveSettings();
          }
        }
        break;
      case "port":
        if (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 65535
        ) {
          this.plugin.settings.port = value;
          await this.plugin.saveSettings();
        }
        break;
      case "token":
        if (typeof value === "string") {
          await this.plugin.setToken(value);
        }
        break;
    }
    this.update();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "Connect MCP clients to the currently open Obsidian vault.",
    });

    new Setting(containerEl).setName("Status").setHeading();

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
            this.update();
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

    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl)
      .setName("Enable bridge")
      .setDesc("Start the local HTTP or HTTPS bridge while Obsidian is running.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (enabled) => {
            this.plugin.settings.enabled = enabled;
            await this.plugin.saveSettings();
            this.update();
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
            this.update();
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
            this.update();
          });
      });

    new Setting(containerEl).setName("Authentication").setHeading();

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
            this.update();
          }),
      );

    new Setting(containerEl).setName("MCP setup").setHeading();

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
              this.update();
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
              ...(this.plugin.getConfigDirPath()
                ? [`OBSIDIAN_CONFIG_DIR=${this.plugin.getConfigDirPath()}`]
                : []),
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

    new Setting(containerEl).setName("Security").setHeading();

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
