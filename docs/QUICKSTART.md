# Quick Start

This guide configures the Obsidian plugin and the Bun MCP server end to end.

## 1. Requirements

- Obsidian Desktop 1.14.4 or later.
- Bun 1.4 or later.
- Node.js 22 or later for plugin builds.
- npm.
- An absolute path to an existing Obsidian vault.
- An MCP desktop client that supports stdio servers.

Check the tools:

```bash
bun --version
node --version
npm --version
```

## 2. Build the project

From the repository root:

```bash
npm install
npm run build
```

The build creates:

```text
dist/a2rg-obsidian-mcp
main.js
manifest.json
```

`dist/a2rg-obsidian-mcp` is the native Bun executable used by MCP clients.
`main.js` and `manifest.json` are the plugin release files.

## 3. Install the plugin

Create the community-plugin folder:

```text
<vault>/.obsidian/plugins/mcp-vault-connector/
```

Copy both plugin files:

```text
manifest.json
main.js
```

Example:

```bash
VAULT='/absolute/path/to/your/vault'
mkdir -p "$VAULT/.obsidian/plugins/mcp-vault-connector"
cp manifest.json main.js "$VAULT/.obsidian/plugins/mcp-vault-connector/"
```

Restart Obsidian or reload Community Plugins, then enable
**A2RG MCP Bridge**.

## 4. Configure the plugin

Open **Settings → Community Plugins → A2RG MCP Bridge**.

Configure:

| Setting | Recommended value |
|---|---:|
| Enable bridge | Enabled |
| Port | `27125` |
| Use local HTTPS | Enabled |
| Bearer token | Automatically generated |

HTTPS is recommended. When enabled, the plugin:

1. Generates a local certificate and private key.
2. Stores plugin settings and the public certificate in Obsidian plugin data.
3. Keeps the private key only in plugin process memory.
4. Displays the certificate fingerprint.

Local HTTPS is disabled by default. Enable it explicitly and keep
`OBSIDIAN_CA_CERT` configured for the MCP server.

The bearer token is a secret. Do not publish it in screenshots, logs, notes,
source control, or public documentation.

Use **Generate a new token** only when rotation is required.

## 5. Configure the MCP server

Create the local environment file:

```bash
cp .env.example .env
```

Set the HTTPS values:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_API_URL=https://127.0.0.1:27125
OBSIDIAN_API_KEY=replace-with-the-plugin-bearer-token
OBSIDIAN_PREFER_REST=true
OBSIDIAN_TIMEOUT_MS=3000
OBSIDIAN_CONFIG_DIR=/absolute/path/to/your/vault/.obsidian
OBSIDIAN_CA_CERT=/absolute/path/to/localhost.pem
```

Rules:

- `OBSIDIAN_VAULT_PATH` must be an absolute directory path.
- `OBSIDIAN_CONFIG_DIR` is optional and must be an absolute path to the
  vault's Obsidian configuration folder. Its default is
  `/absolute/path/to/your/vault/.obsidian`; set it for a custom config folder.
- `OBSIDIAN_API_URL` must use the configured loopback host and port.
- `OBSIDIAN_API_KEY` must exactly match the plugin bearer token.
- `OBSIDIAN_CA_CERT` must be the plugin's generated PEM certificate or a local
  certificate file path when HTTPS is enabled.
- HTTP is available for local testing, but HTTPS is recommended.
- `.env` must not be committed.

## 6. Register the MCP server

The repository includes `.mcp.json` as a local stdio configuration example:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "/absolute/path/to/A2RG.ObsidianMCP/dist/a2rg-obsidian-mcp",
      "args": []
    }
  }
}
```

Replace the repository path with an absolute path on your machine. Some MCP
clients inherit `.env` from the MCP process working directory; others require
the environment variables to be written in their MCP configuration.

Restart or reload the MCP client after changing configuration.

## 7. Verify the bridge

Copy the bearer token from plugin settings:

```bash
export OBSIDIAN_API_KEY='<paste-the-plugin-bearer-token>'
```

For HTTPS:

```bash
curl --fail --silent \
  --cacert /absolute/path/to/localhost.pem \
  -H "Authorization: Bearer $OBSIDIAN_API_KEY" \
  https://127.0.0.1:27125/health
```

For HTTP local testing:

```bash
curl --fail --silent \
  -H "Authorization: Bearer $OBSIDIAN_API_KEY" \
  http://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

Without a valid bearer token, the endpoint returns `401 Unauthorized`.

## 8. Verify the MCP server

List tools and call `list_files` through an MCP stdio client. A successful
server exposes:

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

Call `list_files` with an empty directory to list the vault root.

## 9. Verify filesystem fallback

Stop Obsidian or disable the bridge, keep `OBSIDIAN_VAULT_PATH` configured,
and call a read, search, list, write, append, or delete tool.

The fallback should use the physical vault. `get_active_file` has no
filesystem fallback because it requires Obsidian's active workspace state.
`get_linked_notes` has no resolved-link fallback and returns an empty list
when the plugin bridge is unavailable.

For detailed failures, use [Troubleshooting](TROUBLESHOOTING.md).
