# A2RG MCP Bridge Plugin

Community plugin ID: `mcp-vault-connector`

Current manifest version: `1.0.5`

## Responsibilities

The plugin:

- Reads and writes the active Obsidian instance through `App.vault`,
  `App.metadataCache`, and `App.workspace`.
- Serves REST operations and Streamable HTTP MCP on `/mcp`.
- Authenticates every request with a bearer token.
- Supports HTTP or local HTTPS on `127.0.0.1`.
- Generates a local TLS certificate and private key when HTTPS is enabled.
- Rejects hidden, absolute, traversal, and unsupported-extension paths.
- Searches Markdown files and returns resolved internal-link neighbors.

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

The settings page provides:

- Bridge start/stop status.
- The active HTTP or HTTPS bridge URL.
- The Streamable HTTP MCP endpoint.
- Enable/disable bridge toggle.
- Local HTTPS toggle.
- Loopback port control.
- Bearer-token generation and rotation.
- Public certificate fingerprint and replacement controls.

Do not commit or share `data.json` or the bearer token.

## MCP HTTP endpoint

The plugin binds only to `127.0.0.1`. The default port is `27125`.

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

The MCP endpoint is stateless. It initializes a new MCP server and transport
for each HTTP request, without vault-path or client-side environment variables.

## HTTP operations

The bridge is local infrastructure, not a public API:

| Method | Path | Purpose |
|---|---|---|
| `POST`, `GET`, `DELETE` | `/mcp` | Streamable HTTP MCP. |
| `GET` | `/health` | Check authenticated bridge availability. |
| `GET` | `/active` | Read the active Obsidian file. |
| `GET` | `/list` | List a vault directory. |
| `GET` | `/search` | Search Markdown files. |
| `GET` | `/graph` | Read resolved incoming and outgoing links. |
| `POST` | `/append` | Append to a file. |
| `GET` | `/vault/<path>` | Read a vault file. |
| `PUT` | `/vault/<path>` | Create or replace a vault file. |
| `DELETE` | `/vault/<path>` | Delete a vault file. |

The plugin returns `401` for missing or invalid credentials and `404` for
missing files or routes.

## Provider variables

For HTTP MCP, no vault variables are needed:

- No `OBSIDIAN_VAULT_PATH`.
- No `OBSIDIAN_CONFIG_DIR`.
- No executable `command`.
- No `OBSIDIAN_CA_CERT` unless using HTTPS.
- One bearer token is required in the Authorization header.

The optional stdio executable uses those variables only as a separate fallback
mode.
