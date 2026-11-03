# Contributing

Contributions are welcome: bug fixes, tests, documentation, provider setup,
and Obsidian plugin improvements.

## Prerequisites

- Node.js 22 or later.
- npm.
- Bun.
- Obsidian Desktop 1.14.4 or later for plugin integration tests.
- A local Markdown vault for manual plugin testing.

## Setup

```bash
npm install
npm test
npm run build
```

The MCP executable is written to `dist/a2rg-obsidian-mcp`. The Obsidian bundle
is written to `main.js`.

The Node/npm executable is written to `dist/npm/cli.js`:

```bash
npm run build:npm
node dist/npm/cli.js --discover
npm pack --dry-run
```

## Development workflows

Run the stdio server:

```bash
npm run dev:mcp
```

Watch the Obsidian plugin:

```bash
npm run dev:plugin
```

## Project layout

- `plugin/src/main.ts`: Obsidian plugin lifecycle.
- `plugin/src/bridge/http-bridge.ts`: loopback HTTP/HTTPS and `/mcp`.
- `plugin/src/adapters/`: Obsidian API adapter.
- `src/index.ts`: stdio MCP executable.
- `src/router.ts`: REST-first routing and filesystem fallback.
- `src/mcp-tool-registry.ts`: shared MCP tools.
- `src/tool-schemas.ts`: shared Zod argument validation.
- `test/*.test.ts`: unit and integration tests.
- `docs/*.md`: user and maintainer documentation.
- `docs/NPM.md`: npm/pnpm package and publication guide.

## Before opening a pull request

1. Keep changes focused and preserve existing behavior.
2. Add or update tests for behavior changes.
3. Run `npm test`.
4. Run `npm run build`.
5. Review `git diff --check`.
6. Update the relevant Markdown documentation.
7. Do not commit bearer tokens, private keys, vault data, `.env`, or personal
   Obsidian settings.

For plugin-only changes:

1. Copy `manifest.json` and `main.js` into a test vault.
2. Enable the plugin.
3. Verify HTTP or HTTPS `/mcp`.
4. Verify `tools/list` and at least one read and one write tool.
5. Verify that HTTPS certificate trust works before disabling HTTP.

For stdio changes:

1. Exercise a REST bridge failure.
2. Verify definite REST errors do not trigger filesystem fallback.
3. Verify ambiguous write, append, and delete operations do not retry locally.
4. Verify traversal and absolute paths remain rejected.
5. Verify npm CLI discovery works with no environment variables.
6. Verify plugin-first access works and REST-unavailable fallback reads a real
   vault file.

## Documentation policy

Keep these documents consistent:

- `README.md`
- `docs/QUICKSTART.md`
- `docs/PLUGIN.md`
- `docs/TOOLS.md`
- `docs/TROUBLESHOOTING.md`
- `docs/SECURITY.md`
- `CONTRIBUTING.md`
- `docs/NPM.md`

When changing versions, update `manifest.json`, `package.json`,
`package-lock.json`, `versions.json`, and every version mention in the
documentation.

## Pull requests

Use a clear title and include:

- What changed.
- Why it changed.
- Tests run.
- Manual Obsidian or MCP checks, if applicable.
- Security or compatibility risks.

Small fixes are preferred. Separate unrelated refactors from bug fixes.

## Releases

Maintainers only:

1. Run the full test and build suite.
2. Confirm `manifest.json.version` matches package and compatibility metadata.
3. Commit and push source changes.
4. Create a tag that exactly matches the manifest version, without a `v`
   prefix.
5. Confirm GitHub Actions attached `main.js` and `manifest.json`.
6. Publish the release and submit or refresh the Obsidian community review.
7. Trigger or wait for `.github/workflows/npm-publish.yml`.
8. Verify `npx -y @a2rg/obsidian-mcp --discover` from a clean environment.

Do not commit generated `dist/` or release artifacts unless an existing
repository release process explicitly requires it.
