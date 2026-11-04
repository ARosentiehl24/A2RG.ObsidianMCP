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
  tlsFingerprint: string;
  tlsCertificate: string;
  tlsPrivateKey: string;
  configDir: string;
}

export const DEFAULT_SETTINGS: BridgeSettings = {
  enabled: true,
  port: 27125,
  token: "",
  tlsEnabled: false,
  tlsFingerprint: "",
  tlsCertificate: "",
  tlsPrivateKey: "",
  configDir: "",
};

export function sanitizeBridgeSettings(value: unknown): BridgeSettings {
  const defaults = { ...DEFAULT_SETTINGS, token: "" };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaults;
  }

  const enabled = readProperty(value, "enabled");
  const port = readProperty(value, "port");
  const tlsEnabled = readProperty(value, "tlsEnabled");
  const tlsFingerprint = readProperty(value, "tlsFingerprint");
  const tlsCertificate = readProperty(value, "tlsCertificate");
  const tlsPrivateKey = readProperty(value, "tlsPrivateKey");
  const token = readProperty(value, "token");
  const configDir = readProperty(value, "configDir");

  return {
    enabled: typeof enabled === "boolean" ? enabled : defaults.enabled,
    port:
      typeof port === "number"
      && Number.isInteger(port)
      && port >= 1
      && port <= 65535
        ? port
        : defaults.port,
    token:
      typeof token === "string" && /^[0-9a-f]{64}$/i.test(token)
        ? token
        : "",
    tlsEnabled:
      typeof tlsEnabled === "boolean" ? tlsEnabled : defaults.tlsEnabled,
    tlsFingerprint:
      typeof tlsFingerprint === "string"
        ? tlsFingerprint
        : defaults.tlsFingerprint,
    tlsCertificate:
      typeof tlsCertificate === "string"
        ? tlsCertificate
        : defaults.tlsCertificate,
    tlsPrivateKey:
      typeof tlsPrivateKey === "string"
        ? tlsPrivateKey
        : defaults.tlsPrivateKey,
    configDir:
      typeof configDir === "string"
        ? configDir
        : defaults.configDir,
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
            desc: "Add this value as the bearer token in the MCP client's Authorization header.",
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
            name: "Bearer token",
            desc: "Generated automatically and stored in Obsidian plugin data.",
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
            name: "Streamable HTTP endpoint",
            desc: this.plugin.getMcpUrl(),
          },
          {
            name: "Local certificate",
            desc: this.plugin.getTlsFingerprint()
              ? `SHA-256: ${this.plugin.getTlsFingerprint()}`
              : "Not generated",
            visible: () => this.plugin.isTlsEnabled(),
          },
          {
            name: "Regenerate local TLS certificate",
            desc: "Creates a new persistent certificate and requires re-trusting it in MCP clients.",
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
        ],
      },
      {
        type: "group",
        heading: "Security",
        items: [
          {
            name: "Local-only bridge",
            desc: "The bridge listens only on 127.0.0.1. The bearer token and persistent TLS private key stay in Obsidian plugin data.",
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
              await this.plugin.ensureTlsCertificate();
            }
            await this.plugin.saveSettings();
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
}
