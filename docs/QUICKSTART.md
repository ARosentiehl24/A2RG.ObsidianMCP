# Quick Start

This guide configures Streamable HTTP MCP first. The stdio executable is only
an optional fallback.

Current release: `1.0.8`.

## 1. Requirements

- Obsidian Desktop 1.14.4 or later.
- Node.js 22 or later.
- npm.
- A local Markdown vault.
- An MCP client that supports Streamable HTTP.

## 2. Build and install

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

## 3. Configure the plugin

Open **Settings → Community Plugins → A2RG MCP Bridge**.

| Setting | Recommended value |
|---|---|
| Enable bridge | Enabled |
| Port | `27125` |
| Use local HTTPS | Enabled if the client trusts a local CA |
| Bearer token | Copy or generate |

HTTP endpoint:

```text
http://127.0.0.1:27125/mcp
```

HTTPS endpoint:

```text
https://127.0.0.1:27125/mcp
```

The bridge listens only on `127.0.0.1`.

## 4. Configure the MCP client

For HTTP:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27125/mcp",
      "headers": {
        "Authorization": "Bearer <64-character-plugin-token>"
      }
    }
  }
}
```

For HTTPS, use `https://127.0.0.1:27125/mcp` and configure the client to trust
the certificate PEM displayed or exported by the plugin.

No `command`, executable path, vault path, `OBSIDIAN_API_KEY`,
`OBSIDIAN_VAULT_PATH`, or `OBSIDIAN_CONFIG_DIR` is required for HTTP MCP.

## 5. Verify Streamable HTTP

Initialize the server:

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-check","version":"1.0"}}}' \
  http://127.0.0.1:27125/mcp
```

List tools:

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  http://127.0.0.1:27125/mcp
```

The client should discover:

- `get_file`
- `write_file`
- `append_file`
- `delete_file`
- `search_vault`
- `get_linked_notes`
- `list_files`
- `get_active_file`

## 6. Optional stdio fallback

The executable is useful only when Obsidian or the plugin bridge is unavailable:

```text
dist/a2rg-obsidian-mcp
```

The public package can run the same stdio server without cloning or building
this repository:

```bash
npx -y @a2rg/obsidian-mcp --discover
npx -y @a2rg/obsidian-mcp
```

Configure an MCP client as stdio:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a2rg/obsidian-mcp"]
    }
  }
}
```

No environment variables are needed for the normal plugin-first setup:

- The package discovers the Obsidian vault.
- It reads the plugin port and HTTPS setting.
- It reads the bearer token and public certificate from the vault plugin data.
- It falls back to the filesystem when REST is unavailable.

Use CLI or environment overrides only when discovery is ambiguous or plugin
settings are unavailable:

```bash
obsidian-mcp --vault "/absolute/path/to/Vault"
obsidian-mcp --api-url "https://127.0.0.1:27125"
obsidian-mcp --api-key "<64-character-plugin-token>"
obsidian-mcp --ca-cert "/absolute/path/to/localhost.pem"
```

See [npm and pnpm Package](NPM.md) for complete provider examples.

Fallback environment:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_CONFIG_DIR=/absolute/path/to/your/vault/<Obsidian-config-folder>
OBSIDIAN_API_URL=http://127.0.0.1:27125
OBSIDIAN_API_KEY=<64-character-plugin-token>
OBSIDIAN_PREFER_REST=true
OBSIDIAN_TIMEOUT_MS=3000
```

Do not commit `.env`, bearer tokens, private keys, or certificate private-key
files.

## 7. Verify HTTPS

```bash
curl --fail --silent \
  --cacert /absolute/path/to/localhost.pem \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  https://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

For failures, use [Troubleshooting](TROUBLESHOOTING.md).
