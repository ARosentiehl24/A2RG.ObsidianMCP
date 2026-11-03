# Troubleshooting

## Check Streamable HTTP MCP

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-check","version":"1.0"}}}' \
  http://127.0.0.1:27125/mcp
```

For the authenticated health endpoint:

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  http://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

## `ECONNREFUSED` or bridge unavailable

Possible causes:

- Obsidian is closed.
- **A2RG MCP Bridge** is disabled.
- The plugin failed to start.
- The MCP URL has the wrong port.
- The HTTPS certificate is not trusted.
- A local firewall or network policy blocks loopback traffic.

Check:

1. Obsidian is open.
2. The plugin is enabled.
3. The plugin settings allow the expected port.
4. The bridge status is running.
5. `/health` returns `200`.

When Obsidian is closed, the optional stdio executable can test filesystem
fallback:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
```

`get_active_file` has no filesystem fallback.

## HTTPS certificate verification fails

For HTTPS MCP, configure the client to trust the PEM certificate shown by the
plugin. Node-based clients can use `NODE_EXTRA_CA_CERTS` when the client
supports it.

For the optional stdio REST client:

```dotenv
OBSIDIAN_API_URL=https://127.0.0.1:27125
OBSIDIAN_CA_CERT=/absolute/path/to/localhost.pem
```

Restart the MCP client after changing certificate trust. Do not disable
certificate verification.

The generated certificate is valid only for loopback and is not a public HTTPS
certificate.

## HTTP `401 Unauthorized`

The bearer token differs between the plugin and the MCP configuration.

Check:

1. Open the plugin settings.
2. Copy the current 64-character token.
3. In HTTP/HTTPS MCP configuration, send
   `Authorization: Bearer <64-character-plugin-token>`.
4. For stdio mode, set `OBSIDIAN_API_KEY` to the exact same value.
5. Restart MCP clients.

Any process that caches the old token must be restarted after token rotation.
Do not include bearer tokens in issue reports or screenshots.

## HTTP `404` for active file

No Markdown file is active in Obsidian.

Open a note, then call `get_active_file` again.

## Port already in use

If another process owns the configured port:

1. Stop or remove the conflicting listener.
2. Choose a free port in plugin settings.
3. Restart Obsidian and MCP clients.
4. Update the provider URL to the new port.

The bridge binds only to `127.0.0.1`.

## MCP tools do not appear

For HTTP or HTTPS MCP:

1. Confirm that the client supports Streamable HTTP, not only legacy SSE.
2. Confirm that the URL ends in `/mcp`.
3. Confirm that the bearer header is included.
4. Confirm that Obsidian and the plugin bridge are running.
5. Restart the MCP client.

For stdio fallback:

1. Run `npm run build`.
2. Confirm `dist/a2rg-obsidian-mcp` exists.
3. Confirm the MCP entry path is absolute.
4. Confirm `OBSIDIAN_VAULT_PATH` points to the open vault.
5. Restart the MCP client.

Test the stdio executable directly:

```bash
/absolute/path/to/A2RG.ObsidianMCP/dist/a2rg-obsidian-mcp
```

## MCP server prints a startup error

Common checks:

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

Use an absolute vault path:

```dotenv
OBSIDIAN_VAULT_PATH=/home/alice/Obsidian/MyVault
```

Do not point fallback at `/`, `/home`, or a directory containing unrelated
private files.

## File operation is rejected

Path validation rejects:

- Absolute paths.
- `/../` traversal.
- `.` and `..` segments.
- Empty path segments.
- Windows absolute paths.
- Hidden paths and unsupported extensions.

Use vault-relative forward-slash paths:

```text
Good: 10 - Projects/Alpha.md
Bad:  ../Alpha.md
Bad:  /home/alice/Obsidian/Alpha.md
Bad:  C:\Obsidian\Alpha.md
```

## Search returns too many or too few files

- Default limit: `20`.
- Bridge maximum: `100`.
- `query` is case-insensitive.
- Hidden directories are ignored.
- The stdio fallback searches Markdown and text files.

## Request body limit

Plugin bridge write and append requests are limited to 5 MB. Split large imports
or uploads into smaller operations.

## Public server or HTTPS is not working

The plugin server is loopback-only. It is not a public HTTP or HTTPS service.
Do not publish port `27125` or expose REST routes through a reverse proxy.

See [Security and Public Deployment](SECURITY.md).

## npm package cannot discover the vault

Run:

```bash
npx -y @a2rg/obsidian-mcp --discover
```

The result must include a vault path, plugin URL, and configured bearer token
and CA certificate. If discovery is ambiguous, pass an absolute vault path:

```bash
npx -y @a2rg/obsidian-mcp --vault "/absolute/path/to/Vault" --discover
```

Environment overrides are also available:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_API_URL=https://127.0.0.1:27125
OBSIDIAN_API_KEY=<64-character-plugin-token>
OBSIDIAN_CA_CERT=/absolute/path/to/localhost.pem
OBSIDIAN_PREFER_REST=true
OBSIDIAN_TIMEOUT_MS=3000
```

The package should not be configured with a public hostname or a remote vault
path. The REST and HTTPS bridge remain loopback-only.
