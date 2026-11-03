# npm and pnpm Package

The public package `@a2rg/obsidian-mcp` is the stdio/MCP delivery for users who
need plugin-first REST access and local filesystem fallback.

The Obsidian Community Plugin remains separate. Install it when Obsidian is
open and use the HTTP or HTTPS `/mcp` endpoint directly. Install the npm
package when you want automatic fallback while Obsidian or the bridge is
closed.

## Package model

```text
MCP client
  -> npx/pnpm stdio package
  -> plugin REST on 127.0.0.1:27125
  -> Obsidian APIs

If plugin or Obsidian is unavailable:

MCP client
  -> stdio package
  -> local vault filesystem
```

The package does not expose a public server and does not replace the Obsidian
Community Plugin.

## Published commands

With pnpm:

```bash
pnpm add -g @a2rg/obsidian-mcp
obsidian-mcp --discover
```

With pnpm without a global install:

```bash
pnpm dlx @a2rg/obsidian-mcp --discover
pnpm dlx @a2rg/obsidian-mcp
```

With npm:

```bash
npm install -g @a2rg/obsidian-mcp
obsidian-mcp --discover
```

With npx, no persistent installation is required:

```bash
npx -y @a2rg/obsidian-mcp --discover
```

To run MCP over stdio:

```bash
npx -y @a2rg/obsidian-mcp
```

## Automatic discovery

The package discovers configuration in this order:

1. CLI flags.
2. Environment variables.
3. The open vault in Obsidian's `obsidian.json`.
4. `<vault>/.obsidian/plugins/mcp-vault-connector/data.json`.

This means normal package usage needs no token, vault path, or port variables.
The package reads:

- The Obsidian vault path.
- The plugin enabled state.
- The plugin port.
- HTTP or HTTPS mode.
- The bearer token.
- The public TLS certificate, when HTTPS is enabled.

Discovery is conservative: if multiple vaults are open and no plugin instance
can be identified uniquely, no vault path is guessed.

## CLI overrides

```bash
obsidian-mcp --vault "/absolute/path/to/Vault"
obsidian-mcp --api-url "https://127.0.0.1:27125"
obsidian-mcp --api-key "<64-character-plugin-token>"
obsidian-mcp --ca-cert "/absolute/path/to/localhost.pem"
obsidian-mcp --timeout 3000
obsidian-mcp --prefer-rest true
```

Available environment variables:

| Variable | Purpose |
|---|---|
| `OBSIDIAN_VAULT_PATH` | Absolute filesystem vault path. |
| `OBSIDIAN_APP_CONFIG_DIR` | Override Obsidian app config directory for discovery. |
| `OBSIDIAN_CONFIG_DIR` | Search snapshot directory override. |
| `OBSIDIAN_API_URL` | Loopback plugin HTTP or HTTPS URL. |
| `OBSIDIAN_API_KEY` | Plugin bearer token. |
| `OBSIDIAN_CA_CERT` | PEM content or local PEM file path. |
| `OBSIDIAN_PREFER_REST` | Use plugin REST before filesystem fallback. |
| `OBSIDIAN_TIMEOUT_MS` | REST timeout from 100 to 300000 ms. |

Environment values override plugin `data.json`. CLI flags override environment
values.

## MCP client configuration

For clients that accept stdio JSON:

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

No bearer token is needed in this JSON. The package reads the local plugin
settings from the discovered vault. It uses environment variables or CLI flags
instead if plugin settings are unavailable.

With a local binary:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "obsidian-mcp"
    }
  }
}
```

The package has no public HTTP mode. Use the plugin directly for HTTP or HTTPS:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "https://127.0.0.1:27125/mcp",
      "headers": {
        "Authorization": "Bearer <64-character-plugin-token>"
      }
    }
  }
}
```

## Fallback behavior

The stdio package is plugin-first:

1. It reads REST configuration from plugin settings or environment variables.
2. It sends an MCP tool operation to the plugin when available.
3. If the loopback request fails with a transport or timeout error, it reads or
   writes through the local vault filesystem.
4. If a definite HTTP status is returned, such as `401`, `404`, `413`, or
   another `4xx/5xx`, it does not silently replace the operation with fallback.
5. Ambiguous write, append, and delete operations never retry locally. This
   prevents duplicate mutations after a lost REST response.

The following tools require plugin/Obsidian metadata:

- `get_active_file`
- `get_linked_notes`

These tools are filesystem-capable:

- `get_file`
- `write_file`
- `append_file`
- `delete_file`
- `search_vault`
- `list_files`

## Persistence and caching

The package:

- Uses the same search and file tools as the plugin.
- Persists stdio search snapshots under the discovered vault's
  `OBSIDIAN_CONFIG_DIR/plugins/mcp-vault-connector/cache/`.
- Keeps an in-memory search index and caches search results for 60 seconds.
- Keeps append idempotency results for five minutes.
- Does not keep MCP sessions: each HTTP request remains stateless.
- Reopens or rebuilds local indexes when the stdio process starts.

The Community Plugin has the same search behavior and its own index snapshot
inside the vault plugin directory.

## Package publication

Package maintainers publish from a GitHub tag matching `1.0.x`.

```bash
npm login
npm test
npm run build:npm
npm pack --dry-run
npm publish --access public --provenance
```

Before the first publication:

1. Confirm `package.json.name` is available on npmjs.
2. Create an npm automation or granular access token with publish permission.
3. Add it as GitHub Actions secret `NPM_TOKEN`.
4. Add the `npmjs` environment to the repository.
5. Create or update the npm trusted publisher, if using trusted publishing
   instead of `NPM_TOKEN`.

Package installation is public and does not require an npm account. Only
maintainers authenticate to publish or update the package.

GitHub Packages is not used because npm users typically need authentication
even to install from it. npmjs is public and supports `npx -y` and
`pnpm add -g` without an end-user login.

## Troubleshooting

Run discovery without starting MCP:

```bash
npx -y @a2rg/obsidian-mcp --discover
```

The output should show a vault path, bridge URL, and whether a bearer token and
CA certificate were found. It never prints the bearer token.

If discovery does not find a vault:

```bash
npx -y @a2rg/obsidian-mcp --vault "/absolute/path/to/Vault" --discover
```

If HTTPS certificate verification fails:

```bash
npx -y @a2rg/obsidian-mcp \
  --ca-cert "/absolute/path/to/localhost.pem" \
  --discover
```

Do not disable HTTPS certificate verification. For HTTP-only testing, set:

```bash
npx -y @a2rg/obsidian-mcp \
  --api-url "http://127.0.0.1:27125"
```
