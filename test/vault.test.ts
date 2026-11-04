import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractMatchingLines, TextSearchIndex } from "../src/search-index";
import { VaultManager } from "../src/vault";

test("VaultManager writes, appends, reads and searches Markdown", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-vault-"));

  try {
    const vault = new VaultManager(directory);
    await vault.writeFile("notes/example.md", "Hello");
    await vault.appendFile("notes/example.md", "World");

    assert.equal(await vault.readFile("notes/example.md"), "HelloWorld");
    assert.equal(
      await readFile(path.join(directory, "notes", "example.md"), "utf-8"),
      "HelloWorld",
    );

    const matches = await vault.searchFiles("hello");
    assert.deepEqual(matches.map((match) => match.path), ["notes/example.md"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("VaultManager rejects traversal and absolute paths", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-vault-"));

  try {
    const vault = new VaultManager(directory);
    await assert.rejects(() => vault.readFile("../secret.md"));
    await assert.rejects(() => vault.readFile("/tmp/secret.md"));
    await assert.rejects(() => vault.readFile("C:\\temp\\secret.md"));
    await assert.rejects(() => vault.readFile(".obsidian/plugins/a2rg/data.json"));
    await assert.rejects(() => vault.readFile("secret.json"));
    await assert.rejects(() => vault.writeFile(".hidden/note.md", "secret"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("VaultManager rejects file and directory symlinks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-vault-symlink-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "a2rg-vault-outside-"));

  try {
    await symlink(outside, path.join(directory, "linked"), "dir");
    await symlink(
      path.join(outside, "outside.md"),
      path.join(directory, "linked-file.md"),
      "file",
    );

    const vault = new VaultManager(directory);
    await assert.rejects(() =>
      vault.readFile("linked/outside.md"),
    );
    await assert.rejects(() =>
      vault.readFile("linked-file.md"),
    );
    await assert.rejects(() =>
      vault.writeFile("linked/outside.md", "escape"),
    );
    await assert.rejects(() =>
      vault.writeFile("linked-file.md", "escape"),
    );
    await assert.rejects(() =>
      vault.appendFile("linked-file.md", "escape"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("TextSearchIndex returns only posting candidates and updates documents", () => {
  const index = new TextSearchIndex();
  index.setDocument("notes/one.md", "One", "meeting with Alberto");
  index.setDocument("notes/two.md", "Two", "shopping list");

  assert.deepEqual(index.findCandidates("Alberto"), ["notes/one.md"]);
  assert.deepEqual(index.findCandidates("shopping"), ["notes/two.md"]);

  index.setDocument("notes/one.md", "One", "updated content");
  assert.deepEqual(index.findCandidates("Alberto"), []);
  assert.deepEqual(index.findCandidates("updated"), ["notes/one.md"]);

  index.removeDocument("notes/one.md");
  assert.deepEqual(index.findCandidates("updated"), []);
});

test("TextSearchIndex ranks BM25 matches and ignores accents", () => {
  const index = new TextSearchIndex();
  index.setDocument(
    "notes/general.md",
    "General",
    "articulos sobre noticias y tecnologia",
  );
  index.setDocument(
    "notes/claude.md",
    "Claude Opus",
    "Noticias de inteligencia artificial. Claude Opus publica novedades.",
  );
  index.setDocument(
    "notes/platform.md",
    "Platform",
    "descripcion de una plataforma de noticias",
  );

  const ranked = index.findCandidates("noticias claude", 20);
  assert.equal(ranked[0], "notes/claude.md");

  const accentInsensitive = index.findCandidates("tecnología", 20);
  assert.equal(accentInsensitive[0], "notes/general.md");
});

test("TextSearchIndex persists postings, metadata and complete results", () => {
  const index = new TextSearchIndex();
  index.setDocument(
    "notes/persistent.md",
    "Persistent",
    "durable search cache",
    1234,
    42,
  );
  index.setCachedResults("durable search:20", [
    { path: "notes/persistent.md", matches: ["durable search cache"] },
  ]);

  const restored = new TextSearchIndex();
  restored.restoreSnapshot(index.toSnapshot());

  assert.deepEqual(
    restored.findCandidates("durable", 20),
    ["notes/persistent.md"],
  );
  assert.equal(restored.getDocument("notes/persistent.md")?.sizeBytes, 42);
  assert.deepEqual(
    restored.getCachedResults("durable search:20"),
    [{ path: "notes/persistent.md", matches: ["durable search cache"] }],
  );
});

test("TextSearchIndex rejects unsafe restored documents and postings", () => {
  const index = new TextSearchIndex();
  index.restoreSnapshot({
    version: 3,
    documents: [
      {
        path: "../secret.md",
        name: "secret",
        mtimeMs: 1234,
        sizeBytes: 42,
      },
      {
        path: ".hidden/private.md",
        name: "private",
      },
    ],
    trigrams: [["sec", ["../secret.md"]]],
    bigrams: [["se", ["../secret.md"]]],
    nameTrigrams: [["sec", ["../secret.md"]]],
    nameBigrams: [["se", ["../secret.md"]]],
    termPostings: [["secret", [["../secret.md", 1]]]],
    documentLengths: [["../secret.md", 1]],
    nameTermPostings: [["secret", [["../secret.md", 1]]]],
    nameDocumentLengths: [["../secret.md", 1]],
    queryCache: [
      {
        key: "secret:20",
        expiresAt: Date.now() + 60_000,
        results: [
          { path: "../secret.md", matches: ["poisoned"] },
        ],
      },
    ],
  });

  assert.equal(index.getDocumentCount(), 0);
  assert.deepEqual(index.findCandidates("secret", 20), []);
  assert.equal(index.getCachedResults("secret:20"), undefined);
});

test("Search matching lines are capped in cache results", () => {
  const line = `needle ${"x".repeat(1000)}`;
  const matches = extractMatchingLines(line, "needle", 3);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.length, 500);
});

test("VaultManager persists and reloads the search snapshot", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-persistent-index-"));
  const configDir = path.join(directory, ".obsidian");

  try {
    const vault = new VaultManager(directory, configDir);
    await vault.writeFile("notes/cache.md", "Persistent cache marker");
    assert.deepEqual(
      (await vault.searchFiles("persistent cache")).map((match) => match.path),
      ["notes/cache.md"],
    );

    const cachePath = path.join(
      configDir,
      "plugins",
      "mcp-vault-connector",
      "cache",
      "search-index-v3.json.gz",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const snapshot = JSON.parse(
      gunzipSync(await readFile(cachePath)).toString("utf-8"),
    );
    assert.equal(snapshot.version, 3);
    assert.ok(Array.isArray(snapshot.documents));

    const reloaded = new VaultManager(directory, configDir);
    assert.deepEqual(
      (await reloaded.searchFiles("persistent cache")).map((match) => match.path),
      ["notes/cache.md"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("VaultManager reconciles before search when cache is empty", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-lazy-cache-"));
  const configDir = path.join(directory, "custom-obsidian");

  try {
    await mkdir(path.join(directory, "notes"), { recursive: true });
    await writeFile(
      path.join(directory, "notes", "cached.md"),
      "Novedades de plataforma",
      "utf8",
    );

    const first = new VaultManager(directory, configDir);
    assert.deepEqual(
      (await first.searchFiles("novedades")).map((match) => match.path),
      ["notes/cached.md"],
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    const reloaded = new VaultManager(directory, configDir);
    assert.deepEqual(
      (await reloaded.searchFiles("novedades")).map((match) => match.path),
      ["notes/cached.md"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("VaultManager stores the search snapshot in a custom config directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a2rg-custom-config-"));
  const configDir = path.join(directory, "custom-obsidian");

  try {
    const vault = new VaultManager(directory, configDir);
    await vault.writeFile("notes/custom.md", "Custom config cache");
    assert.deepEqual(
      (await vault.searchFiles("custom config")).map((match) => match.path),
      ["notes/custom.md"],
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    const cachePath = path.join(
      configDir,
      "plugins",
      "mcp-vault-connector",
      "cache",
      "search-index-v3.json.gz",
    );
    const snapshot = JSON.parse(
      gunzipSync(await readFile(cachePath)).toString("utf-8"),
    );
    assert.equal(snapshot.version, 3);
    assert.ok(Array.isArray(snapshot.documents));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
