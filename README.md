# A2RG MCP Bridge

A2RG MCP Bridge connects MCP clients to an open Obsidian vault through a local
desktop plugin. It exposes eight vault tools through Streamable HTTP MCP and
keeps an optional Bun stdio process for filesystem fallback.

Current release: `1.0.9`.

## Components

- **Obsidian plugin** `mcp-vault-connector`: reads and writes the active vault
  through Obsidian APIs and exposes a loopback HTTP or HTTPS server.
- **MCP executable** `dist/a2rg-obsidian-mcp`: optional stdio fallback for
  filesystem access when Obsidian or the plugin bridge is unavailable.
- **Public npm package** `@a2rg/obsidian-mcp`: Node stdio executable for
  plugin-first access and automatic filesystem fallback.
- **Shared tool registry**: the plugin and stdio executable expose the same
  eight tools and argument schemas.

## Architecture

```text
MCP client
  -> Streamable HTTP /mcp
  -> authenticated local plugin bridge
  -> App.vault / App.metadataCache / App.workspace
```

HTTP is convenient for loopback testing. HTTPS is recommended when the client
supports local certificate trust.

## Quick start

1. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

2. Copy `manifest.json` and `main.js` into:

   ```text
   <vault>/.obsidian/plugins/mcp-vault-connector/
   ```

3. Enable **A2RG MCP Bridge** in Obsidian Community Plugins.

4. In plugin settings:
   - Enable the bridge.
   - Keep port `27125` unless a conflict requires another port.
   - Enable local HTTPS only if the MCP client can trust the generated certificate.
   - Copy the 64-character bearer token.

5. Configure the MCP client:

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

Direct HTTPS uses `https://127.0.0.1:27125/mcp`. Trust the plugin certificate
before connecting. The certificate and private key persist across Obsidian
reloads and restarts. Use **Regenerate local TLS certificate** in plugin
settings only when you intentionally replace that identity.

HTTP MCP does not require `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_CONFIG_DIR`,
`OBSIDIAN_API_KEY`, `OBSIDIAN_API_URL`, a `command`, or an executable path.
The provider needs only the MCP URL and the bearer token.

## Network and privacy disclosure

The plugin starts a server only on `127.0.0.1` (localhost). It does not expose
the vault to the public internet, send vault content to a remote service,
collect telemetry, or include dynamic advertising.

Every `/mcp` and REST request requires a generated bearer token. HTTP is
available for trusted loopback testing; HTTPS is recommended. The optional npm
stdio package can access only the discovered local vault when the bridge is
unavailable, and does not provide a public network endpoint.

## Verify

```bash
curl --fail --silent \
  -H "Authorization: Bearer <64-character-plugin-token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  http://127.0.0.1:27125/mcp
```

The server exposes:

- `get_file`
- `write_file`
- `append_file`
- `delete_file`
- `search_vault`
- `get_linked_notes`
- `list_files`
- `get_active_file`

## Requirements

- Obsidian Desktop 1.14.4 or later.
- Node.js 22 or later for source builds.
- npm.
- A local Markdown vault.
- An MCP client with Streamable HTTP support.

## Optional stdio fallback

The stdio executable remains available when Obsidian or the plugin bridge is
unavailable. It can discover the vault and plugin settings automatically.
Environment variables remain available for overrides.

Run the public npm package without a global install:

```bash
npx -y @a2rg/obsidian-mcp
```

Or install it with npm/pnpm:

```bash
npm install -g @a2rg/obsidian-mcp
# or
pnpm add -g @a2rg/obsidian-mcp
```

With pnpm without a global install:

```bash
pnpm dlx @a2rg/obsidian-mcp --discover
pnpm dlx @a2rg/obsidian-mcp
```

Discovery can be checked without starting MCP:

```bash
npx -y @a2rg/obsidian-mcp --discover
```

The package:

1. Tries plugin HTTP/HTTPS REST first.
2. Uses the Obsidian vault filesystem if the bridge is unavailable.
3. Avoids filesystem fallback after definite `4xx/5xx` responses.
4. Avoids filesystem writes after ambiguous REST write, append, or delete
   operations.

See [npm and pnpm Package](docs/NPM.md) for MCP client configuration,
auto-discovery, CLI flags, cache behavior, and publication.

## Documentation

- [Quick Start](docs/QUICKSTART.md)
- [Plugin Guide](docs/PLUGIN.md)
- [MCP Tools](docs/TOOLS.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security and Public Deployment](docs/SECURITY.md)
- [npm and pnpm Package](docs/NPM.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Development

```bash
npm test
npm run dev:mcp
npm run dev:plugin
npm run build:npm
npm run build
```

Run synthetic search benchmarks:

```bash
npm run benchmark:search -- 1000
npm run benchmark:search -- 10000
npm run benchmark:search -- 100000
```

`npm test` runs the Bun test suite. `npm run build` type-checks both targets,
bundles `main.js`, and compiles `dist/a2rg-obsidian-mcp`.

## Release

Plugin releases use `.github/workflows/release.yml`.

1. Update `manifest.json`, `package.json`, `package-lock.json`, and
   `versions.json` to the same version.
2. Run `npm test` and `npm run build`.
3. Commit and push the source changes.
4. Create and push a tag that exactly matches `manifest.json.version`; do not
   prefix it with `v`.
5. Publish the GitHub draft release with `main.js` and `manifest.json`.
6. Submit or refresh the Obsidian community review.
7. Run or trigger `.github/workflows/npm-publish.yml` to publish the npm CLI.

## Security boundary

- The plugin binds only to `127.0.0.1`.
- Every `/mcp` and REST request requires the bearer token.
- Relative vault paths are validated.
- Absolute paths and `.` / `..` path segments are rejected.
- Request bodies are capped at 5 MB.
- HTTP is limited to local testing.
- HTTPS uses a generated self-signed certificate that clients must trust.
- The stdio fallback does not replace authentication for a public service.

Read [Security and Public Deployment](docs/SECURITY.md) before changing this
local-only deployment model.
