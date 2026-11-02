import {
  App,
  Notice,
  PluginSettingTab,
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

export function sanitizeBridgeSettings(value: unknown): BridgeSettings {
  const defaults = { ...DEFAULT_SETTINGS, token: "" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaults;
  }

  const enabled = readProperty(value, "enabled");
  const port = readProperty(value, "port");
  const tlsEnabled = readProperty(value, "tlsEnabled");
  const tlsCertificatePath = readProperty(value, "tlsCertificatePath");
  const tlsPrivateKeyPath = readProperty(value, "tlsPrivateKeyPath");
  const tlsFingerprint = readProperty(value, "tlsFingerprint");

  return {
    enabled: typeof enabled === "boolean" ? enabled : defaults.enabled,
    port:
      typeof port === "number"
      && Number.isInteger(port)
      && port >= 1
      && port <= 65535
        ? port
        : defaults.port,
    token: "",
    tlsEnabled:
      typeof tlsEnabled === "boolean" ? tlsEnabled : defaults.tlsEnabled,
    tlsCertificatePath:
      typeof tlsCertificatePath === "string"
        ? tlsCertificatePath
        : defaults.tlsCertificatePath,
    tlsPrivateKeyPath:
      typeof tlsPrivateKeyPath === "string"
        ? tlsPrivateKeyPath
        : defaults.tlsPrivateKeyPath,
    tlsFingerprint:
      typeof tlsFingerprint === "string"
        ? tlsFingerprint
        : defaults.tlsFingerprint,
  };
}

function readProperty(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

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
            name: "Copy bearer token",
            action: () => {
              void this.copyToClipboard(
                this.plugin.settings.token,
                "Bearer token",
              );
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
            name: "Local certificate",
            desc: this.plugin.getTlsFingerprint()
              ? `SHA-256: ${this.plugin.getTlsFingerprint()}`
              : "Not generated",
            visible: () => this.plugin.isTlsEnabled(),
            action: () => {
              void this.copyToClipboard(
                this.plugin.getTlsCertificatePath(),
                "CA certificate path",
              );
            },
          },
          {
            name: "Copy public certificate",
            visible: () => this.plugin.isTlsEnabled(),
            action: () => {
              void (async () => {
                try {
                  const certificate = await this.plugin.readTlsCertificate();
                  await this.copyToClipboard(
                    certificate,
                    "Local certificate",
                  );
                } catch (error: unknown) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  new Notice(`Could not copy the certificate: ${message}`);
                }
              })();
            },
          },
          {
            name: "Generate a replacement certificate",
            visible: () => this.plugin.isTlsEnabled(),
            action: () => {
              void (async () => {
                try {
                  await this.plugin.generateTlsCertificate();
                  this.update();
                } catch (error: unknown) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  new Notice(
                    `Could not generate the local certificate: ${message}`,
                  );
                }
              })();
            },
          },
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
      {
        type: "group",
        heading: "Security",
        items: [
          {
            name: "Local-only bridge",
            desc: "The bridge listens only on 127.0.0.1. The bearer token and private key stay outside the vault.",
          },
          {
            name: "Bearer token access",
            desc: "Keep the bearer token private. It grants read and write access to the open vault.",
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
          try {
            if (value) {
              await this.plugin.generateTlsCertificate();
            } else {
              await this.plugin.saveSettings();
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            new Notice(`Could not generate the local certificate: ${message}`);
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
          try {
            await this.plugin.setToken(value);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            new Notice(`Could not update the bearer token: ${message}`);
          }
        }
        break;
    }
    this.update();
  }

  private async copyToClipboard(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      new Notice(`${label} copied.`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      new Notice(`Could not copy ${label}: ${message}`);
    }
  }
}
