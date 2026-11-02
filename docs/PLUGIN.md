# A2RG MCP Bridge Plugin

This plugin is the active-Obsidian adapter for A2RG Obsidian MCP.

Community plugin ID: `mcp-vault-connector`

Current manifest version: `1.0.4`

## Responsibilities

The plugin:

- Reads the active Obsidian instance through `App.vault`,
  `App.metadataCache`, and `App.workspace`.
- Starts and stops an HTTP or HTTPS server on loopback.
- Authenticates requests with a bearer token.
- Generates a local TLS certificate and private key.
- Creates missing parent folders during writes.
- Rejects hidden, absolute, traversal, unsupported-extension, symlink, and
  ambiguous vault paths.
- Searches Markdown files with an in-memory and persistent index.
- Returns resolved incoming and outgoing internal-link neighbors.

The MCP server is a separate Bun stdio process. The plugin does not implement
the Model Context Protocol itself.

## Installation

Build from the repository root:

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

## Settings

Settings are stored in:

```text
<vault>/.obsidian/plugins/mcp-vault-connector/data.json
```

The settings file contains non-secret state similar to:

```json
{
  "enabled": true,
  "port": 27125,
  "tlsEnabled": true,
  "tlsFingerprint": "SHA-256 fingerprint",
  "tlsCertificate": "-----BEGIN CERTIFICATE-----..."
}
```

The bearer token is stored in Obsidian plugin data. The public certificate is
stored in plugin data for MCP configuration. The generated TLS private key is
held only in the plugin process memory and is not persisted.

The settings page provides:

- Bridge start/stop status.
- Loopback URL.
- Enable/disable bridge toggle.
- Local HTTPS toggle.
- Loopback port control.
- Public certificate fingerprint and replacement controls.

Do not commit or share `data.json` or the bearer token.

## Port

The plugin binds only to `127.0.0.1`. The port must be an integer from `1`
through `65535`; the default is `27125`.

Changing the port restarts the bridge. Set the matching
`OBSIDIAN_API_URL` in the MCP environment.

## Bearer token

The token is 32 random bytes represented as 64 hexadecimal characters.
The plugin stores it in Obsidian plugin data, and the MCP server receives the
same value through `OBSIDIAN_API_KEY`.

Rotate the token when:

- A machine or MCP configuration may have been copied.
- A user no longer needs MCP access.
- The existing token was exposed in logs or screenshots.
- Credentials are being reissued as maintenance.

After rotation:

1. Update `OBSIDIAN_API_KEY`.
2. Restart MCP clients.
3. Confirm `/health` succeeds.
4. Remove old values from shell history and secret stores.

## HTTPS

Local HTTPS is optional. It is recommended for normal use and uses a generated
self-signed certificate that is verified by the MCP client through the
configured CA.

When HTTPS is enabled:

- Set `OBSIDIAN_API_URL=https://127.0.0.1:<port>`.
- Set `OBSIDIAN_CA_CERT` to the plugin's PEM certificate or to a local certificate file path.

HTTP is retained for local testing. It must remain loopback-only.

## Commands

The plugin registers these command-palette actions:

| Command | Purpose |
|---|---|
| Start MCP bridge | Start the loopback server. |
| Stop MCP bridge | Stop the loopback server. |
| Show MCP bridge status | Display the current running state. |

The plugin also starts or stops the bridge according to the enabled setting.

## HTTP operations

The bridge is local infrastructure, not a public API:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check authenticated bridge availability. |
| `GET` | `/active` | Read the active Obsidian file. |
| `GET` | `/list` | List a vault directory. |
| `GET` | `/search` | Search Markdown files. |
| `GET` | `/graph` | Read resolved incoming and outgoing Obsidian graph links. |
| `POST` | `/append` | Append to a file. |
| `GET` | `/vault/<path>` | Read a vault file. |
| `PUT` | `/vault/<path>` | Create or replace a vault file. |
| `DELETE` | `/vault/<path>` | Delete a vault file. |

Authenticated requests use:

```text
Authorization: Bearer <token>
```

The plugin returns `401` for missing or invalid credentials, `404` for missing
files, and validation errors for unsafe paths or unsupported operations.

## Search and cache

The plugin maintains a trigram/bigram posting index for note names and
Markdown content, plus headings, tags, and frontmatter metadata.

The index is updated on create, modify, rename, delete, metadata-change, and
metadata-delete events. Search results are ranked by resolved incoming-link
count when available.

The plugin persists a snapshot under the plugin manifest directory:

```text
<Obsidian config directory>/plugins/mcp-vault-connector/cache/search-index-v1.json
```

The snapshot is restored if fresh, and only document metadata and posting maps
are persisted. Full note contents and complete search-result payloads are not
stored in the snapshot.

## Graph

The graph tool uses Obsidian's `resolvedLinks` metadata cache. It can traverse
incoming, outgoing, or both directions with a depth from `1` to `3`.

If the bridge is unavailable, the filesystem fallback has no resolved-link
metadata and returns an empty linked-note list.

## Development

```bash
npm test
npm run dev:plugin
npm run build
```

`esbuild.config.mjs` bundles `plugin/src/main.ts` into `main.js`.
`plugin/tsconfig.json` performs strict type checking without emitting JavaScript.

Obsidian plugin releases require:

- `manifest.json`
- `main.js`
- A GitHub tag matching `manifest.json.version`
- Optional `styles.css` if the plugin ships one
