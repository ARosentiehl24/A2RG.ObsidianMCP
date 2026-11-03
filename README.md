# A2RG MCP Bridge

A local Model Context Protocol (MCP) integration for Obsidian, with a desktop
plugin, Streamable HTTP transport, and an optional stdio filesystem fallback.

The project has two cooperating components:

- **A2RG MCP Bridge** (`mcp-vault-connector`) reads and writes the active vault
  through `App.vault`, `App.metadataCache`, and `App.workspace`.
- **A2RG Obsidian MCP** exposes the same eight tools through Streamable HTTP
  at `/mcp`. The Bun executable remains available as an optional stdio fallback.

Current release: `1.0.5`.

## Architecture

```text
MCP client
    |
    | HTTP or HTTPS + bearer token
    v
http://127.0.0.1:27125/mcp
    |
    v
A2RG MCP Bridge plugin
    |
    v
App.vault / App.metadataCache / App.workspace
```

For HTTP MCP, no vault path or executable is needed in the provider: the plugin
uses the vault that is open in Obsidian. The optional stdio executable can
still use `OBSIDIAN_VAULT_PATH` as a filesystem fallback when Obsidian or the
bridge is unavailable.

> [!IMPORTANT]
> The bridge is local desktop infrastructure. It binds only to
> `127.0.0.1` and must not be published directly to the internet.

## Quick start

1. Build and install the plugin:

   ```bash
   npm install
   npm run build
   ```

2. Copy `manifest.json` and `main.js` into:

   ```text
   <vault>/.obsidian/plugins/mcp-vault-connector/
   ```

3. Enable **A2RG MCP Bridge** in Obsidian.

4. In plugin settings:
   - Enable the bridge.
   - Keep port `27125` unless you deliberately change it.
   - Choose HTTP or generate a local HTTPS certificate.
   - Copy the bearer token.

5. Configure the MCP client with:

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

No `OBSIDIAN_VAULT_PATH`, executable `command`, vault `.obsidian` directory,
or filesystem API key variables are required for HTTP MCP.

## Verify

```bash
curl --fail --silent \
  -H "Authorization: Bearer <paste-the-plugin-bearer-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:27125/mcp
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
- Node.js 22 or later for plugin builds.
- npm.
- A local Markdown vault.
- An MCP client that supports Streamable HTTP or stdio servers.

## Optional stdio fallback

The stdio executable remains available when Obsidian is closed or the bridge is
unavailable. It needs `OBSIDIAN_VAULT_PATH` and, for REST-first behavior,
`OBSIDIAN_API_URL` and `OBSIDIAN_API_KEY`. HTTP MCP does not need those
variables.

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
- Every `/mcp` and REST request requires the bearer token.
- Relative vault paths are validated.
- Absolute paths and `.` / `..` path segments are rejected.
- Request bodies are capped at 5 MB.
- HTTP is retained for loopback-only local testing.
- HTTPS is optional and uses a generated local certificate.
- The stdio fallback does not replace authentication for a remote service.

Read [Security and Public Deployment](docs/SECURITY.md) before changing the
loopback-only deployment model.
