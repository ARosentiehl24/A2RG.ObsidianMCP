# MCP Tools

The MCP server exposes eight tools through Streamable HTTP at `/mcp` and
through the optional stdio executable. Relative paths are vault-relative, not
absolute filesystem paths.

All tools return MCP text content. Search and list operations serialize JSON
inside that text content.

## `get_file`

Reads a Markdown or text file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |

```json
{"path":"00 - Inicio.md"}
```

The plugin bridge is preferred. The stdio executable may use
`OBSIDIAN_VAULT_PATH` when the bridge is unavailable.

## `write_file`

Creates or replaces a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |
| `content` | string | Yes | Complete replacement content. |

```json
{
  "path":"01 - Inbox/New note.md",
  "content":"# New note\n"
}
```

The plugin creates missing folders while active. The stdio fallback also
creates parent directories.

## `append_file`

Adds text to the end of a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |
| `content` | string | Yes | Text to append. |

If the file does not exist, it is created.

The plugin keeps append idempotency keys for five minutes. Reusing a key with
the same path and content does not append twice. A reused key with different
content is rejected.

## `delete_file`

Deletes a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |

This operation is destructive. There is no MCP recycle bin or undo operation.
Delete only through an explicit user request or a confirmed workflow.

## `search_vault`

Searches note names and Markdown or text content.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `query` | string | Yes | - | Case-insensitive search text. |
| `limit` | number | No | `20` | Maximum result files. |

```json
{"query":"meeting","limit":50}
```

The plugin maintains an in-memory field-aware BM25 index for names, titles,
Markdown content, headings, tags, and frontmatter. It uses term frequencies
and document frequencies to rank files rather than returning only
insertion-order matches.

Field weights:

- Title/H1: `3.5`
- Headings: `2.5`
- Tags: `2`
- Frontmatter: `1.5`
- Filename and content retain separate BM25 scoring.

It keeps compact token trigrams for candidate discovery and accent-insensitive
matching. Search text is normalized with Unicode-compatible lowercase and
diacritic removal.

Plugin bridge results use BM25 ranking first and resolved incoming-link count
as a secondary tie-break signal. Stdio fallback uses the same BM25 ranking
without resolved Obsidian link metadata.

The plugin persists an index snapshot under:

```text
<Obsidian config directory>/plugins/mcp-vault-connector/cache/search-index-v4.json.gz
```

The snapshot stores document metadata and posting maps, not complete note
content or search-result payloads.

On startup, the search loads the snapshot first and reconciles changes in the
background. Cached candidates return immediately; searches not present in the
snapshot wait until reconciliation discovers candidates before returning.

For capacity validation, run:

```bash
npm run benchmark:search -- 1000
npm run benchmark:search -- 10000
npm run benchmark:search -- 100000
```

The benchmark measures initial indexing, cold and warm queries, incremental
indexing of 1000 documents, snapshot size, precision, recall, heap and RSS.

## `get_linked_notes`

Returns notes connected through Obsidian's resolved internal-link graph.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `path` | string | Yes | - | Vault-relative source note. |
| `direction` | string | No | `both` | `incoming`, `outgoing`, or `both`. |
| `depth` | number | No | `1` | Graph depth from 1 to 3. |
| `limit` | number | No | `20` | Maximum result notes. |

```json
{
  "path":"Projects/Roadmap.md",
  "direction":"both",
  "depth":2,
  "limit":50
}
```

Filesystem fallback cannot provide resolved internal-link metadata and returns
an empty list.

## `list_files`

Lists direct children of a vault directory.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `directory` | string | No | `""` | Vault-relative directory. |

```json
{"directory":"10 - Proyectos"}
```

The root directory is represented by an empty string.

Each item includes:

- `path`
- `name`
- `isDirectory`
- `size` for files
- `mtime` for stdio filesystem fallback items

## `get_active_file`

Returns the content of the currently active Obsidian file.

No parameters.

This tool has no filesystem fallback. It requires Obsidian, the plugin bridge,
and an open active Markdown file.

## Path rules

All path-taking tools reject:

- Empty paths.
- Absolute Unix or Windows paths.
- `/`, `\`, `.`, `..`, and empty segments.
- Traversal attempts such as `../secret.md`.
- Hidden path segments.
- Unsupported extensions where applicable.

Use vault-relative paths with forward-slash separators.

## Transport behavior

```text
Obsidian running
  -> authenticated plugin bridge
  -> tool operation

Obsidian closed or bridge unavailable
  -> optional stdio filesystem fallback
```

| Operation | Bridge unavailable |
|---|---|
| `get_file` | Read through `OBSIDIAN_VAULT_PATH`. |
| `search_vault` | Search the fallback BM25 index. |
| `list_files` | List direct children from the filesystem. |
| `write_file` | Write to the filesystem unless REST status is ambiguous. |
| `append_file` | Append unless REST status is ambiguous or timed out. |
| `delete_file` | Delete unless REST status is ambiguous. |
| `get_linked_notes` | Return an empty list. |
| `get_active_file` | No fallback. |

Ambiguous mutations do not retry through the filesystem. This prevents an
operation from being applied twice when a REST response may have been lost.

## HTTP/HTTPS versus npm stdio

The HTTP and HTTPS MCP transports belong to the running Obsidian plugin. They
do not read the vault filesystem directly and do not continue when Obsidian or
the plugin bridge is unavailable.

The npm/pnpm stdio executable is plugin-first and may use filesystem fallback:

```text
npx -y @a2rg/obsidian-mcp
  -> plugin REST/HTTPS
  -> if transport unavailable: local vault filesystem
```

It discovers the vault and plugin settings from Obsidian's app configuration and
the plugin `data.json`. It also accepts `OBSIDIAN_VAULT_PATH`,
`OBSIDIAN_API_URL`, `OBSIDIAN_API_KEY`, `OBSIDIAN_CA_CERT`, and CLI overrides.
