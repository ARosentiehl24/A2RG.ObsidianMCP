# MCP Tools

The MCP server exposes eight stdio tools. Relative paths are vault-relative,
not absolute filesystem paths.

All tools return MCP text content. Search and list operations additionally
serialize JSON in that text content.

## `get_file`

Reads a Markdown or text file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |

Example:

```json
{
  "path": "00 - Inicio.md"
}
```

The plugin bridge is preferred. The direct filesystem fallback reads from
`OBSIDIAN_VAULT_PATH`.

## `write_file`

Creates or replaces a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |
| `content` | string | Yes | Complete replacement content. |

Example:

```json
{
  "path": "01 - Inbox/New note.md",
  "content": "# New note\n"
}
```

The plugin creates missing folders while active. The filesystem fallback
also creates parent directories.

## `append_file`

Adds text to the end of a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |
| `content` | string | Yes | Text to append. |

If the file does not exist, the operation creates it.

## `delete_file`

Deletes a file.

| Parameter | Type | Required | Description |
|---|---|---:|---|
| `path` | string | Yes | Vault-relative file path. |

This operation is destructive. There is no MCP recycle-bin or undo operation.
Delete only through an explicit user request or a confirmed workflow.

## `search_vault`

Searches note names and Markdown or text content.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `query` | string | Yes | - | Case-insensitive search text. |
| `limit` | number | No | `20` | Maximum number of result files. |

Example:

```json
{
  "query": "meeting",
  "limit": 50
}
```

Plugin bridge search is preferred. Filesystem fallback is used when the bridge
cannot be reached.

The plugin maintains an in-memory trigram and bigram posting index, including
note names, Markdown content, headings, tags, and frontmatter. The index is
updated on create, modify, rename, and delete events. Search results are ranked
by resolved incoming-link count when available.

The plugin also persists a local snapshot in:

```text
<vault>/.obsidian/plugins/a2rg-mcp-bridge/cache/search-index-v1.json
```

The snapshot contains document metadata and posting maps. It does not contain
full note contents or persisted search-result payloads. The file is replaced
atomically and is accepted only when it is a regular file with private
permissions. Search results remain in memory and expire after 60 seconds.

## `get_linked_notes`

Returns notes connected to a note through Obsidian's resolved internal-link
graph. This operation is available through the plugin bridge.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---:|---|
| `path` | string | Yes | - | Vault-relative source note path. |
| `direction` | string | No | `both` | `incoming`, `outgoing`, or `both`. |
| `depth` | number | No | `1` | Maximum graph depth, from 1 to 3. |
| `limit` | number | No | `20` | Maximum number of result notes. |

Example:

```json
{
  "path": "Projects/Roadmap.md",
  "direction": "both",
  "depth": 2,
  "limit": 50
}
```

The response includes `path`, `depth`, `linkCount`, and `direction`. A
filesystem fallback without the plugin returns an empty list because
resolved internal-link metadata is available only in Obsidian.

## `list_files`

Lists direct children of a vault directory.

| Parameter | Type | Required | Default | Description |
|---|---|---:|---|---|
| `directory` | string | No | `""` | Vault-relative directory. |

Example:

```json
{
  "directory": "10 - Proyectos"
}
```

The root directory is represented by an empty string.

Result items include:

- `path`
- `name`
- `isDirectory`
- `size`, for files
- `mtime`, for filesystem fallback items

## `get_active_file`

Returns the content of the active Obsidian file.

No parameters.

This tool has no filesystem fallback. It returns a message when no active file
is available or the plugin bridge is disconnected.

## Path rules

All tools that accept a path must reject:

- Empty paths.
- Absolute Unix or Windows paths.
- `/`, `\`, `.`, `..`, and empty path segments.
- Traversal attempts such as `../secret.md`.

Use vault-relative paths with forward slash separators.

## Fallback behavior

```text
Obsidian running
  -> authenticated plugin bridge

Obsidian closed or bridge unavailable
  -> OBSIDIAN_VAULT_PATH

Active file
  -> plugin bridge only
```

Fallback is per operation. A bridge failure does not invalidate the
filesystem fallback configuration.
