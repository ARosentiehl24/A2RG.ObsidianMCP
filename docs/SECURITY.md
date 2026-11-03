# Security and Public Deployment

## Supported deployment model

A2RG MCP Bridge is designed for a single desktop machine:

```text
MCP client -> HTTP/HTTPS /mcp endpoint -> plugin -> Obsidian

Optional stdio fallback:
MCP client -> stdio process -> 127.0.0.1 plugin bridge or vault filesystem
```

The plugin server binds only to `127.0.0.1`. It must not be exposed directly
to the public internet.

If Obsidian is closed, the MCP server should use
`OBSIDIAN_VAULT_PATH` for direct filesystem fallback. The fallback is a local
desktop feature and is not a substitute for authentication in a remote service.

## Authentication

Every bridge request requires a bearer token:

```text
Authorization: Bearer <64-character-token>
```

The token is generated with 32 random bytes and represented by 64 hexadecimal
characters. It is not a TLS certificate, private key, or public key.

Protect the following values:

- `~/.config/obsidian/a2rg-mcp-bridge/token`: contains the plugin bearer token.
- `~/.config/obsidian/a2rg-mcp-bridge/tls/localhost-key.pem`: contains the local
  TLS private key.
- `plugin/data.json`: contains non-secret bridge settings.
- `<Obsidian config directory>/plugins/mcp-vault-connector/cache/search-index-v1.json`: contains
  vault file names and posting metadata.
- `.env`: may contain `OBSIDIAN_API_KEY` for optional stdio mode.
- HTTP MCP client configuration: contains the bearer token in the Authorization
  header.
- MCP client configuration: may contain environment values or secret references.
- Shell history: may contain token values if commands are pasted insecurely.

Do not place bearer tokens in Markdown notes, issue reports, screenshots,
source control, or public documentation.

## Transport security

The bridge binds only to loopback. HTTP is supported for local testing, while
HTTPS is recommended and certificate verification is always enabled. The MCP
client refuses TLS certificates that it cannot verify against the configured
CA; no environment variable can disable certificate verification.

The plugin refuses to start the bridge when the secure configuration directory,
bearer-token file, or TLS private key has insecure POSIX permissions. It also
checks that the TLS private key is stored inside the secure configuration
directory. These checks are platform-specific and require a filesystem that
applies POSIX modes.

Do not use SSH port forwarding or reverse-proxy configuration that publishes:

- `127.0.0.1:27125`
- `/vault/*`
- `/append`
- `/delete`
- `/active`

without both authentication and TLS.

There is no CORS or browser login flow. Bearer authentication alone is not
enough for a public network endpoint.

## Using HTTP and HTTPS MCP

The plugin exposes MCP at `/mcp` over loopback HTTP or HTTPS. HTTP is suitable
for local testing and trusted loopback clients. HTTPS uses a generated
self-signed certificate that clients must explicitly trust. Neither mode is
intended for public network access.

For a public deployment, HTTP or HTTPS belongs at an external MCP service
boundary. The public service must implement authentication and use a publicly
trusted certificate.

Recommended architecture:

```text
Public client
  -> TLS reverse proxy
  -> authenticated MCP HTTP/SSE service
  -> server filesystem or server-side vault API

Obsidian desktop
  -> loopback plugin bridge
  -> local MCP client or optional stdio fallback
```

Do not send desktop vault credentials to an untrusted remote server.

## Certificate files

A public HTTPS server needs a certificate chain and private key:

| File | Purpose | Permissions |
|---|---|---|
| `fullchain.pem` | Public certificate chain sent to clients. | `0644` |
| `privkey.pem` | Server private key. | `0600`, ideally restricted to the service account. |

Use a certificate issued for the public hostname, such as a certificate from
Let's Encrypt. Do not use a self-signed certificate for a public endpoint.

Keep private keys outside source control and plugin settings:

```text
/etc/a2rg-mcp/tls/fullchain.pem
/etc/a2rg-mcp/tls/privkey.pem
```

Example permissions:

```bash
sudo chmod 600 /etc/a2rg-mcp/tls/privkey.pem
sudo chmod 755 /etc/a2rg-mcp/tls
sudo chown root:a2rg-mcp /etc/a2rg-mcp/tls/privkey.pem
sudo chmod 644 /etc/a2rg-mcp/tls/fullchain.pem
```

The exact service account and group names depend on the host.

For local TLS testing, a self-signed certificate can be generated, but clients
must explicitly trust or verify it. The plugin stores the public certificate in
its plugin data and keeps the private key only in process memory. Set
`OBSIDIAN_CA_CERT` to the PEM certificate or to a local certificate file path.
It is not intended for public HTTPS:

```bash
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -days 30 \
  -subj "/CN=localhost"
```

This command is for testing only. Public browsers and API clients will not
trust this certificate automatically.

## Reverse proxy requirements

A reverse proxy should:

- Listen on public HTTPS port `443`.
- Serve a valid certificate for the public hostname.
- Forward traffic only to an authenticated loopback MCP service.
- Set reasonable request-size limits.
- Disable public access to plugin administration endpoints.
- Apply rate limiting and audit logging.
- Strip untrusted `Authorization`, forwarding headers, and routing headers.
- Run with a minimal service account.
- Rotate private keys, bearer tokens, and certificates according to policy.

An example Caddy file can obtain certificates automatically:

```caddy
mcp.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

This example requires a public DNS record and a Caddy listener on port `3000`
that implements MCP authentication. It does not expose the Obsidian plugin
bridge.

## Vault data protections

- Use an allowlisted, absolute vault path.
- Do not run the fallback against `/`, `/home`, or a parent directory containing
  unrelated credentials.
- Back up the vault before enabling remote write operations.
- Reject path traversal and absolute paths at every trust boundary.
- Limit request bodies and search result counts.
- Do not expose deletion as a public operation without confirmation and audit
  controls.
- Review files and permissions after writes.

## Vulnerability reporting

Do not open a public issue for an unpatched credential leak or remote vault
write vulnerability.

Report suspected vulnerabilities privately to the repository maintainer with:

- Affected version or commit.
- Attack prerequisites.
- Reproduction steps.
- Impact.
- Suggested remediation.

Rotate a compromised token before publishing details.
