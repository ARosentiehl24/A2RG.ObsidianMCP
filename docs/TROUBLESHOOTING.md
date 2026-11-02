# Troubleshooting

## Check the bridge

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
- `OBSIDIAN_API_URL` uses the wrong port.
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

## HTTP `401 Unauthorized`

The bearer token differs between plugin and MCP environment.

Check:

1. Open the plugin settings.
2. Copy the current token.
3. Set the exact same value in `OBSIDIAN_API_KEY`.
4. Restart MCP clients.

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

Check:

1. `npm run build` completed successfully.
2. `dist/a2rg-obsidian-mcp` exists.
3. The MCP entry path is absolute.
4. The MCP client was restarted.
5. The server is not disabled in client configuration.

Test the server directly:

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
<vault>/.obsidian/plugins/a2rg-mcp-bridge/data.json
```

The bearer token and TLS private key are stored outside the vault at:

```text
~/.config/obsidian/a2rg-mcp-bridge/
```

Check that this directory is writable and private. Do not commit `data.json`
or copy the bearer token and TLS private key into the vault.

## Public server or HTTPS is still not working

This project is not a public HTTPS server. It does not implement public MCP
authentication, OAuth, certificate loading, or reverse proxy termination.

See [Security and Public Deployment](SECURITY.md).
