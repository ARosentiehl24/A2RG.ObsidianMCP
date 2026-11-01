# A2RG.ObsidianMCP

Enterprise-grade, high-performance hybrid Model Context Protocol (MCP) server for Obsidian by Alberto (@a2rg).

## Vision and Objective

The goal of this MCP server is to deliver seamless, resilient, and blazing-fast integration with Obsidian vaults for AI agents and assistants.

Unlike legacy or unmaintained MCP implementations that strictly rely on an active Obsidian instance running the Local REST API plugin, this project implements a **hybrid architecture**:

1. **Active Application Mode (Primary)**: Communicates with Obsidian via the Local REST API to interact with active tabs, workspaces, and live editor states.
2. **Direct Filesystem Mode (Fallback / Offline)**: When Obsidian is closed or unreachable, it falls back instantly to direct filesystem operations on the vault markdown files, maintaining full YAML frontmatter parsing, tag indexing, and link integrity.

## Architecture

- **Runtime**: TypeScript via Node.js / Bun.
- **Protocol**: MCP standard (Model Context Protocol) over stdio.
- **Engine Components**:
  - `VaultManager`: Handles file discovery, path resolution, markdown parsing, and frontmatter extraction.
  - `ApiClient`: Connects to Obsidian Local REST API with automatic HTTPS self-signed certificate handling.
  - `HybridRouter`: Transparently routes tool calls to the active API or falls back to direct filesystem operations.
  - `ToolsRegistry`: Defines MCP tools for reading, creating, patching, searching, and organizing notes.

## Planned Capabilities

- Dynamic fallback between REST API and Direct Vault Storage.
- Robust markdown manipulation (append, prepend, section patch, frontmatter updates).
- Fast local fuzzy and regex searching across note titles, tags, and content.
- Support for daily notes, templates, and task extraction.
- Zero downtime: works whether Obsidian is running, crashed, or closed.

## Roadmap

- [ ] Project setup with TypeScript, Bun/Node, and official `@modelcontextprotocol/sdk`.
- [ ] Core configuration loader (vault paths, API keys, ports).
- [ ] Direct filesystem vault reader/writer implementation.
- [ ] Obsidian Local REST API client.
- [ ] Hybrid routing layer.
- [ ] Tool definitions and MCP server lifecycle handling.
