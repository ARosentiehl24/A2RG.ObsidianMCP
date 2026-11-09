# Architecture

The [interactive architecture diagram](architecture/a2rg-obsidian-mcp-architecture.html)
shows the runtime paths, trust boundaries, search services, and persistence
used by A2RG MCP Bridge. It is a self-contained HTML document and can be opened
directly in a browser.

The editable Archify source is
[a2rg-obsidian-mcp-architecture.json](architecture/a2rg-obsidian-mcp-architecture.json).
The diagram is pinned to revision `d94ebc5eaa2e0d2281a2243d029cdff675f6a64d`.

## Runtime paths

### Direct plugin mode

```text
MCP client
  -> local HTTPS /mcp
  -> bearer authentication
  -> shared MCP tool registry
  -> Obsidian vault adapter
  -> Vault / metadataCache / workspace APIs
```

The plugin owns this path. It serves Streamable HTTP MCP and the supporting
REST endpoints only on `127.0.0.1`. HTTPS is the default; plain HTTP requires
an explicit testing-only opt-in.

### npm stdio fallback

```text
MCP client
  -> npm stdio server
  -> shared MCP tool registry
  -> hybrid router
  -> plugin REST
  -> filesystem fallback only when safely available
```

The stdio package prefers the running plugin bridge. It can fall back to the
local vault filesystem when the bridge is unavailable. Definite HTTP errors
do not trigger fallback, and ambiguous mutations are not retried to avoid
duplicate writes or deletes.

## Search and graph services

The plugin indexes Markdown through Obsidian vault and metadata events. Ranking
uses field-aware BM25 for title/H1, headings, tags, frontmatter, filename, and
content. Incoming and outgoing note links come from
`App.metadataCache.resolvedLinks`.

The filesystem fallback uses the same search implementation and persists a
compressed snapshot under the Obsidian configuration directory. Cache reads
reject symlinks and insecure permissions. Cache writes use random exclusive
temporary files with `O_EXCL` and `O_NOFOLLOW`.

## Security boundaries

- MCP and REST traffic stays on loopback.
- Every bridge request requires the bearer token.
- HTTPS validates the generated local certificate.
- Plain HTTP is blocked unless explicitly enabled for testing.
- Vault paths are normalized and traversal is rejected.
- Hidden directories and symlinks are excluded.
- Filesystem operations use `O_NOFOLLOW` where applicable.
- Search cache persistence rejects symlinked directories and files.
- Request bodies and search results are bounded.

For deployment constraints and token handling, see
[Security and Public Deployment](SECURITY.md).
