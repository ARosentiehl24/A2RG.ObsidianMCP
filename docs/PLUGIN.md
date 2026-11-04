# A2RG MCP Bridge Plugin

Community plugin ID: `mcp-vault-connector`

Current manifest version: `1.0.10`

## Responsibilities

The plugin:

- Reads and writes the active vault through `App.vault`,
  `App.metadataCache`, and `App.workspace`.
- Serves REST operations and Streamable HTTP MCP at `/mcp`.
- Authenticates every `/mcp` and REST request with a bearer token.
- Supports HTTP or local HTTPS on `127.0.0.1`.
- Generates a local TLS certificate and private key when HTTPS is enabled.
- Rejects hidden, absolute, traversal, and unsupported-extension paths.
- Searches Markdown files and resolves internal-link neighbors.

## Installation

```bash
npm install
npm run build
```

Copy `manifest.json` and `main.js` into:

```text
<vault>/.obsidian/plugins/mcp-vault-connector/
```

Restart Obsidian or reload Community Plugins, then enable
**A2RG MCP Bridge**.

## Settings

Settings are stored in:

```text
<vault>/.obsidian/plugins/mcp-vault-connector/data.json
```

Do not commit or share `data.json`, the bearer token, or the generated private
key material. The TLS certificate and private key are persisted together so
Obsidian restarts reuse the same local HTTPS identity.

Use **Regenerate local TLS certificate** in plugin settings only when the
certificate must be replaced. Regeneration restarts the bridge and requires
re-trusting the new certificate in each MCP client.

The settings page provides:

- Bridge start/stop status.
- The active HTTP or HTTPS base URL.
- The Streamable HTTP MCP endpoint.
- Enable/disable bridge toggle.
- Local HTTPS toggle.
- Loopback port control.
- Bearer-token generation and rotation.
- Public certificate fingerprint and replacement controls.

The bridge starts automatically when enabled in plugin settings. It listens
only on `127.0.0.1` and does not connect to remote services or
collect telemetry. The generated bearer token controls access to vault tools.

## MCP endpoints

The bridge binds only to `127.0.0.1`. The default port is `27125`.

HTTP:

```text
http://127.0.0.1:27125/mcp
```

HTTPS:

```text
https://127.0.0.1:27125/mcp
```

Every request requires:

```text
Authorization: Bearer <64-character-plugin-token>
```

The MCP endpoint is stateless. It creates a new MCP server and Streamable HTTP
transport for each request. A persistent MCP session is not required.

## REST operations

The REST routes are supporting endpoints for the plugin bridge and remain
local-only infrastructure:

| Method | Path | Purpose |
|---|---|---|
| `POST`, `GET`, `DELETE` | `/mcp` | Streamable HTTP MCP. |
| `GET` | `/health` | Authenticated bridge availability check. |
| `GET` | `/active` | Read the active Obsidian file. |
| `GET` | `/list` | List a vault directory. |
| `GET` | `/search` | Search Markdown files. |
| `GET` | `/graph` | Read resolved link neighbors. |
| `POST` | `/append` | Append to a file. |
| `GET` | `/vault/<path>` | Read a vault file. |
| `PUT` | `/vault/<path>` | Create or replace a vault file. |
| `DELETE` | `/vault/<path>` | Delete a vault file. |

## Provider configuration

HTTP MCP needs no vault variables:

- No `OBSIDIAN_VAULT_PATH`.
- No `OBSIDIAN_CONFIG_DIR`.
- No executable `command`.
- No filesystem API key.
- One bearer token in the `Authorization` header.

When HTTPS is enabled, the MCP client also needs to trust the plugin's local
certificate.

The optional stdio executable is a separate fallback mode. It can use
`OBSIDIAN_VAULT_PATH`, `OBSIDIAN_API_URL`, `OBSIDIAN_API_KEY`, and
`OBSIDIAN_CONFIG_DIR` when needed.

The npm package `@a2rg/obsidian-mcp` uses the same stdio executable behavior
from Node. It can discover the vault and plugin settings automatically, with
CLI and environment overrides for ambiguous or custom setups. See
[npm and pnpm Package](NPM.md).
