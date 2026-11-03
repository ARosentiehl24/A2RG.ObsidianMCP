# Security and Public Deployment

## Supported deployment model

A2RG MCP Bridge is designed for one desktop machine:

```text
MCP client
  -> HTTP or HTTPS loopback /mcp
  -> authenticated Obsidian plugin
  -> open vault
```

Optional stdio fallback:

```text
MCP client
  -> stdio process
  -> plugin bridge or local filesystem
```

The plugin bridge starts a loopback-only server according to the bridge
setting. The plugin does not send vault content to a remote service and does
not collect telemetry.

The plugin binds only to `127.0.0.1`. Do not expose the bridge directly to
the public internet.

## Authentication

Every `/mcp` and REST request requires a bearer token:

```text
Authorization: Bearer <64-character-plugin-token>
```

The token is generated from 32 random bytes and represented as 64 hexadecimal
characters.

Protect:

- The bearer token.
- Obsidian plugin `data.json`.
- The generated TLS private key while HTTPS is enabled.
- Search-index snapshot files.
- MCP client configuration and environment values.
- Shell history and issue screenshots.

Do not place bearer tokens or private keys in Markdown notes, source control,
issue reports, screenshots, or public documentation.

## Transport security

HTTP is supported only for trusted loopback testing. HTTPS is recommended and
uses a generated self-signed certificate that clients must explicitly trust.

The plugin private key is held in plugin process memory. The public certificate
and related settings are stored in plugin data.

Do not use SSH forwarding or reverse proxies to publish:

- `127.0.0.1:27125`
- `/mcp`
- `/vault/*`
- `/append`
- `/delete`
- `/active`

There is no public browser login or OAuth flow.

## Using HTTP or HTTPS MCP

The plugin serves MCP at `/mcp` over loopback HTTP or HTTPS.

- HTTP: simplest local setup, but bearer traffic stays unencrypted on the
  loopback interface.
- HTTPS: recommended local setup, but the MCP client must trust the generated
  local certificate.

Neither mode is intended for public network access.

For a public service, use an external MCP server with authentication and a
certificate issued for a public hostname.

```text
Public client
  -> public HTTPS
  -> authenticated external MCP service
  -> server filesystem or server-side vault API

Obsidian desktop
  -> loopback plugin bridge
  -> local MCP client or optional stdio fallback
```

Do not send desktop vault credentials to an untrusted remote server.

## Vault data protections

- Use an allowlisted absolute vault path only for stdio fallback.
- Do not run fallback against `/`, `/home`, or a parent directory containing
  unrelated credentials.
- Reject path traversal and absolute paths at every trust boundary.
- Limit request bodies and search result counts.
- Back up the vault before enabling remote or automated write operations.
- Review files and permissions after writes.
- Delete only through explicit user confirmation or a confirmed workflow.

## Dynamic code and JSON validation

The plugin HTTP bridge uses the MCP SDK with the Cloudflare Worker-compatible
JSON Schema validator. It does not use `eval`, `new Function`, or AJV code
generation in the plugin bundle.

Tool arguments are also parsed by the shared Zod schemas in
`src/tool-schemas.ts`.

## npm package and filesystem fallback

The public npm package is an optional stdio process. Its loopback REST request
uses the discovered plugin bearer token only inside the local machine.

Filesystem fallback can read or write the allowlisted absolute vault path. It
must not access `/`, `/home`, or a parent directory containing unrelated data.
The package rejects absolute paths and traversal at the vault boundary.

The package does not publish an MCP server, forward the vault over the network,
or store the bearer token in source control.

## Dependency and build policy

- Keep direct MCP SDK dependencies pinned or bounded in `package.json`.
- Run `npm test` and `npm run build` before releases.
- Inspect `main.js` for unexpected dynamic code or new network behavior.
- Review third-party dependency changes before merging.

## Vulnerability reporting

Do not open a public issue for an unpatched credential leak or remote vault
write vulnerability.

Report suspected vulnerabilities privately to the repository maintainer with:

- Affected version or commit.
- Reproduction prerequisites.
- Reproduction steps.
- Impact.
- Suggested remediation.

Rotate a compromised token before publishing details.
