# A2RG MCP Bridge

A Bun-based Model Context Protocol (MCP) server for Obsidian, with a desktop
bridge plugin and a direct filesystem fallback.

The project has two cooperating components:

- **A2RG MCP Bridge** (`mcp-vault-connector`) reads and writes the active vault
  through `App.vault`, `App.metadataCache`, and `App.workspace`.
- **A2RG Obsidian MCP** runs over MCP stdio and exposes vault operations to
  MCP clients.

Current release: `1.0.4`.

## Architecture

```text
MCP client
    |
    | stdio
    v
A2RG Obsidian MCP (Bun executable)
    |
    +--> https://127.0.0.1:27125
    |         |
    |         v
    |    A2RG MCP Bridge plugin
    |         |
    |         v
    |    App.vault / App.metadataCache / App.workspace
    |
    +--> OBSIDIAN_VAULT_PATH
              |
              v
         Direct Markdown files
```

The plugin bridge is preferred while Obsidian is running. If it is unavailable,
supported operations can fall back to direct filesystem access.

> [!IMPORTANT]
> The bridge is local desktop infrastructure. It binds only to
> `127.0.0.1` and must not be published directly to the internet.

## Quick start

Follow [Quick Start](docs/QUICKSTART.md) for the complete setup.

The shortest setup is:

1. Build the MCP executable and plugin:

   ```bash
   npm install
   npm run build
   ```

2. Copy `manifest.json` and `main.js` into:

   ```text
   <vault>/.obsidian/plugins/mcp-vault-connector/
   ```

3. Enable **A2RG MCP Bridge** under Obsidian Community Plugins.

4. In plugin settings:
   - Enable the bridge.
   - Keep port `27125` unless you deliberately change it.
   - Enable local HTTPS.
   - Copy or generate the bearer token.
   - Copy the generated CA certificate path.

5. Create `.env` from `.env.example`:

   ```dotenv
   OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
   OBSIDIAN_API_URL=https://127.0.0.1:27125
   OBSIDIAN_API_KEY=replace-with-the-plugin-bearer-token
   OBSIDIAN_PREFER_REST=true
   OBSIDIAN_TIMEOUT_MS=3000
   OBSIDIAN_CONFIG_DIR=/absolute/path/to/your/vault/.obsidian
   OBSIDIAN_CA_CERT=/absolute/path/to/localhost.pem
   ```

6. Register `dist/a2rg-obsidian-mcp` as the stdio MCP executable.

## Verify the setup

With HTTPS enabled:

```bash
export OBSIDIAN_API_KEY='<paste-the-bearer-token>'

curl --fail --silent \
  --cacert /absolute/path/to/localhost.pem \
  -H "Authorization: Bearer $OBSIDIAN_API_KEY" \
  https://127.0.0.1:27125/health
```

Expected response:

```json
{"status":"ok"}
```

The MCP client should discover eight tools:

- `get_file`
- `write_file`
- `append_file`
- `delete_file`
- `search_vault`
- `get_linked_notes`
- `list_files`
- `get_active_file`

See [MCP tools](docs/TOOLS.md) for parameters and behavior.

## Requirements

- Obsidian Desktop 1.14.4 or later.
- Bun 1.4 or later.
- Node.js 22 or later for the plugin build.
- npm.
- A local Markdown vault.
- An MCP client that supports stdio servers.

## MCP client configuration

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

Use absolute paths for `OBSIDIAN_VAULT_PATH` and the Bun executable. Configure
the environment in `.env` or in the MCP client's server configuration.

Some clients use different configuration filenames or fields, but the effective
definition is the same: one stdio process, an absolute executable path, and
access to the vault environment.

## Plugin and MCP behavior

| Operation | Obsidian running | Obsidian closed |
|---|---|---|
| Read file | Plugin bridge | Filesystem fallback |
| Write file | Plugin bridge | Filesystem fallback |
| Append file | Plugin bridge | Filesystem fallback |
| Delete file | Plugin bridge | Filesystem fallback |
| List files | Plugin bridge | Filesystem fallback |
| Search vault | Plugin bridge | Indexed filesystem fallback |
| Linked notes | Obsidian resolved-link graph | Empty fallback |
| Active file | Plugin bridge only | No active file |

Ambiguous transport failures skip filesystem fallback for write, append, and
delete operations to avoid duplicating a mutation whose REST result is unknown.

## Documentation

- [Quick Start](docs/QUICKSTART.md)
- [Plugin Guide](docs/PLUGIN.md)
- [MCP Tools](docs/TOOLS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security and Public Deployment](docs/SECURITY.md)

## Development

```bash
npm test
npm run dev:mcp
npm run dev:plugin
npm run build
```

`npm test` uses Bun's test runner. `npm run build` type-checks the plugin,
bundles `main.js`, and compiles `dist/a2rg-obsidian-mcp`.

## Release

Plugin releases are automated by `.github/workflows/release.yml`.

1. Update `manifest.json`, `package.json`, `package-lock.json`, and
   `versions.json`.
2. Commit and push the source changes.
3. Create and push a tag matching `manifest.json.version`.
4. Let GitHub Actions build, test, attest, and create a draft release.
5. Publish the draft with `main.js` and `manifest.json` attached.
6. Submit or update the plugin in the Obsidian community directory.

## Security boundary

- The plugin listens only on `127.0.0.1`.
- Every bridge request requires the bearer token.
- Relative vault paths are validated.
- Absolute paths and `.` / `..` path segments are rejected.
- Request bodies are capped at 5 MB.
- The TLS private key is held only in process memory; plugin settings contain only the public certificate.
- The fallback does not replace authentication for a remote service.

Read [Security and Public Deployment](docs/SECURITY.md) before changing the
loopback-only deployment model.
