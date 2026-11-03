import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: "/* A2RG MCP Bridge: bundled Obsidian plugin */",
  },
  entryPoints: ["plugin/src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "node:crypto",
    "node:fs",
    "node:fs/promises",
    "node:http",
    "node:https",
    "node:http2",
    "node:net",
    "node:os",
    "node:path",
    "node:stream",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();
