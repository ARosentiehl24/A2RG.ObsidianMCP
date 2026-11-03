# Troubleshooting

## Check HTTP or HTTPS MCP

Verify the MCP endpoint, not only the REST health endpoint:

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-check","version":"1.0"}}}' \
  http://127.0.0.1:27125/mcp
```

## REST health

```bash
export OBSIDIAN_API_KEY='<paste-the-plugin-bearer-token>'
curl --fail --silent \
  -H "Authorization: Bearer ${OBSIDIAN_API_KEY}" \
  http://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

## `ECONNREFUSED` or bridge unavailable

Possible causes:

- Obsidian is closed.
- The plugin is disabled.
- The plugin failed to start.
- The HTTP MCP URL uses the wrong port.
- The HTTPS certificate is not trusted.
- A firewall or local network policy blocks loopback access.

Check:

1. Obsidian is open.
2. **A2RG MCP Bridge** is enabled.
3. Port is `27125` or matches `.env`.
4. `/health` returns `200`.

If Obsidian is closed, test a filesystem operation instead:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
```

`get_active_file` has no filesystem fallback.

## HTTPS is enabled but the MCP server fails TLS verification

For HTTPS MCP, configure the client to trust the PEM certificate shown by the
plugin. For the optional stdio REST client, set `OBSIDIAN_CA_CERT` to that PEM
certificate or to an exact local certificate file path.

```dotenv
OBSIDIAN_API_URL=https://127.0.0.1:27125
OBSIDIAN_CA_CERT=/absolute/path/to/localhost.pem
```

Restart the MCP client after changing the CA path. Do not disable certificate
verification. The generated self-signed certificate is valid only for this
loopback setup and is not for a public HTTPS server.

## HTTP `401 Unauthorized`

The bearer token differs between plugin and MCP configuration.

Check:

1. Open the plugin settings.
2. Copy the current token.
3. In HTTP/HTTPS MCP configuration, send `Authorization: Bearer <token>`.
4. For stdio mode, set `OBSIDIAN_API_KEY` to the exact same value.
5. Restart MCP clients.

The plugin supports token rotation. Any process that caches the old token must
be restarted.

Do not include the token in issue reports or screenshots.

## HTTP `404` for active file

No Markdown file is active in Obsidian.

Open a note, then call `get_active_file` again.

## Port already in use

If another process owns the configured port:

1. Stop or remove the conflicting listener.
2. Choose a different port in plugin settings.
3. Set the same port in `OBSIDIAN_API_URL`.
4. Restart Obsidian and MCP clients.

The bridge binds only to `127.0.0.1`.

## MCP tools do not appear

For HTTP or HTTPS MCP:

Check:

1. The client supports Streamable HTTP MCP.
2. The URL ends in `/mcp`.
3. The bearer header is included.
4. Obsidian and the plugin bridge are running.
5. The MCP client was restarted.

For stdio fallback, verify the executable separately:

1. `npm run build` completed successfully.
2. `dist/a2rg-obsidian-mcp` exists.
3. The MCP entry path is absolute.
4. The server is not disabled in client configuration.

Test the stdio server directly:

```bash
/absolute/path/to/A2RG.ObsidianMCP/dist/a2rg-obsidian-mcp
```

A stdio server normally waits without printing additional text after startup.

## MCP server prints a startup error

Run the compiled Bun entry point directly:

```bash
./dist/a2rg-obsidian-mcp
```

Common errors:

| Symptom | Likely action |
|---|---|
| `Cannot find module` | Run `npm install` and `npm run build`. |
| `ENOTDIR` or missing `dist` | Build from the repository root. |
| Vault path is missing | Set `OBSIDIAN_VAULT_PATH`. |
| No active file | Open a note before calling `get_active_file`. |
| Invalid JSON | Check MCP client arguments and tool parameters. |

## Filesystem fallback reads the wrong vault

Verify:

```bash
test -d "$OBSIDIAN_VAULT_PATH"
```

Use an absolute path without placeholders:

```dotenv
OBSIDIAN_VAULT_PATH=/home/alice/Obsidian/MyVault
```

Do not point the fallback at `/`, `/home`, or a directory containing unrelated
private files.

## File operation is rejected

Path validation rejects:

- Absolute paths.
- `/../` traversal.
- `.` and `..` segments.
- Empty path segments.
- Windows absolute paths.

Use vault-relative paths:

```text
Good: 10 - Projects/Alpha.md
Bad:  ../Alpha.md
Bad:  /home/alice/Obsidian/Alpha.md
Bad:  C:\Obsidian\Alpha.md
```

## Search returns too many or too few files

The plugin bridge and fallback accept the `limit` parameter.

- Default limit: `20`.
- Bridge maximum: `100`.
- `query` is case-insensitive.
- Hidden directories are ignored.
- Only Markdown and text files are searched by fallback.

## Request body limit

Plugin bridge write and append requests are limited to 5 MB. Split large
imports or uploads into smaller confirmed operations.

## Plugin settings are not retained

Settings are stored in:

```text
<vault>/.obsidian/plugins/mcp-vault-connector/data.json
```

The bearer token and public TLS certificate are stored in Obsidian plugin data.
The TLS private key is held only in plugin process memory. Do not commit
`data.json` or copy the bearer token into the vault.

## Public server or HTTPS is still not working

The plugin server is loopback-only and is not a public HTTPS or public MCP
server. Do not publish its port or REST endpoints.

See [Security and Public Deployment](SECURITY.md).
