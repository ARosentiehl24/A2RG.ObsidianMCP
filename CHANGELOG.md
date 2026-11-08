# Changelog

All notable changes to this project are documented in this file.

## 1.0.12 - 2026-11-07

- Fixed bridge status appearing stopped in settings even while the local HTTPS
  server was running.
- Register the settings tab after automatic bridge startup so it observes the
  correct initial state.

## 1.0.11 - 2026-11-07

- Added field-aware BM25 ranking for title/H1, headings, tags, frontmatter,
  filename, and content.
- Added title/headings/tags/frontmatter fields to search snapshots.
- Added field-ranking tests and reproducible benchmark coverage.
- Blocked authenticated REST traffic over plain HTTP unless explicitly enabled.
- Made local HTTPS the plugin default and added a testing-only insecure HTTP toggle.
- Hardened search-cache reads and writes against predictable temporary files
  and symlinked cache paths.

## 1.0.10 - 2026-11-03

- Fixed popout-window compatibility by using `window.setTimeout()` for deferred
  search reconciliation.
- Removed unused `serializePostings` code.
- Documented vault enumeration and its authentication, traversal, and
  hidden-directory safeguards.
- Preserved HTTP/HTTPS, stdio fallback, persistent TLS, BM25 search, and
  incremental indexing behavior.

## 1.0.9 - 2026-11-03

- Replaced the slow full-document-indexing behavior with a cache-first, lazy
  reconciliation model.
- Fixed quadratic incremental indexing: existing documents now remove and
  replace postings; new documents add postings directly.
- Added a BM25-only benchmark path and synthetic 1k, 10k, and 100k benchmarks.
- Added persistent gzip snapshots and up to 128 restored query-cache entries.
- Added a persistent TLS certificate/private-key pair for stable local HTTPS.
- Added a settings action to regenerate the local TLS certificate explicitly.
- Added custom Obsidian config-folder discovery through `Vault#configDir`.
- Preserved plugin HTTP/HTTPS and stdio filesystem fallback behavior.
- Updated HTTP, HTTPS, npm, pnpm, npx, fallback, certificate, and benchmark
  documentation.
- Added reproducible synthetic search benchmarks for 1k, 10k, and 100k
  documents.
- Benchmark 100k result: `4.89 s` initial indexing, `79.854 ms` cold query,
  `81.186 ms` warm query, `31.2 ms` incremental 1000-document batch,
  `273.7 MB` heap and `580.9 MB` RSS.

## 1.0.8 - 2026-11-03

- Added support for custom Obsidian vault configuration folders using `Vault#configDir`.
- Updated vault discovery and plugin settings cache paths.
- Added a custom-config-folder test.

## 1.0.7 - 2026-11-03

- Added the public npm/pnpm package `@a2rg/obsidian-mcp`.
- Added executable packaging and `npx`, `npm exec`, and `pnpm dlx` support.
- Added plugin-first HTTPS/HTTP routing with local filesystem fallback.
- Documented npm, pnpm, HTTPS, fallback, and security configuration.
- Deprecated the `0.0.0-stage` and `1.0.6` package versions.

## 1.0.6 - 2026-11-03

- Replaced AJV with the MCP SDK's Cloudflare Worker-compatible JSON Schema validator.
- Removed dynamic code execution from plugin validation paths.
- Added plugin build shims for Obsidian community review compatibility.
- Added release and npm provenance workflows.

## 1.0.5 - 2026-11-03

- Added Streamable HTTP MCP at `/mcp`.
- Added HTTP and local HTTPS bridge support.
- Added bearer-token authentication.
- Exposed eight vault tools through HTTP and stdio transports.
- Added optional stdio filesystem fallback.
- Corrected MCP dependency and plugin bundle configuration.

## 1.0.4 - 2026-11-02

- Addressed Obsidian community review findings.
- Improved plugin source and release compliance.

## 1.0.3 - 2026-11-02

- Fixed source-review warnings.
- Updated plugin structure and documentation.

## 1.0.2 - 2026-11-02

- Prepared the initial packaged Obsidian MCP Bridge release.

## 1.0.1 - 2026-11-02

- Added initial Obsidian plugin and MCP bridge implementation.
