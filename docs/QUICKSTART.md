# Quick Start

This guide configures Streamable HTTP MCP first. The stdio executable is optional.

## 1. Requirements

- Obsidian Desktop 1.14.4 or later.
- Node.js 22 or later.
- npm.
- An MCP client that supports Streamable HTTP.
- A local Markdown vault.

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
| Use local HTTPS | Disabled for the simplest HTTP setup |
| Bearer token | Copy or generate |

The plugin displays the endpoint:

```text
http://127.0.0.1:27125/mcp
```

Use HTTPS instead only if the MCP client can trust the plugin's generated
local certificate.

## 4. Configure the MCP client

Example HTTP MCP entry:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27125/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-the-plugin-bearer-token"
      }
    }
  }
}
```

The provider does not need a `command`, executable path, vault path,
`OBSIDIAN_API_KEY`, `OBSIDIAN_VAULT_PATH`, or `OBSIDIAN_CONFIG_DIR`.

The bearer token is the only secret configured in the provider. It is generated
by the plugin and grants read/write access to the open vault.

For HTTPS, use `https://127.0.0.1:27125/mcp` and configure the MCP client to
trust the plugin certificate.

## 5. Verify HTTP MCP

Initialize and list tools:

```bash
curl --fail --silent \
  -H "Authorization: Bearer <paste-the-plugin-bearer-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:27125/mcp
```

A working bridge exposes:

```text
get_file
write_file
append_file
delete_file
search_vault
get_linked_notes
list_files
get_active_file
```

## 6. Optional stdio fallback

The stdio executable is useful only when Obsidian is closed or HTTP is
unavailable:

```text
dist/a2rg-obsidian-mcp
```

Its fallback configuration is separate:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_CONFIG_DIR=/absolute/path/to/your/vault/.obsidian
OBSIDIAN_API_URL=http://127.0.0.1:27125
OBSIDIAN_API_KEY=replace-with-the-plugin-bearer-token
OBSIDIAN_PREFER_REST=true
OBSIDIAN_TIMEOUT_MS=3000
```

Do not commit `.env` or bearer tokens.

## 7. Verify HTTPS

```bash
curl --fail --silent \
  --cacert /absolute/path/to/localhost.pem \
  -H "Authorization: Bearer <paste-the-plugin-bearer-token>" \
  https://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

For detailed failures, use [Troubleshooting](TROUBLESHOOTING.md).
