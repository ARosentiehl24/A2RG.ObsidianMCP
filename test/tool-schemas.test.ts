import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  appendFileArgsSchema,
  deleteFileArgsSchema,
  getFileArgsSchema,
  getLinkedNotesArgsSchema,
  searchVaultArgsSchema,
  writeFileArgsSchema,
} from "../src/tool-schemas";

test("MCP file argument schemas reject missing and wrong types", () => {
  assert.throws(() => getFileArgsSchema.parse({}));
  assert.throws(() => getFileArgsSchema.parse({ path: "" }));
  assert.throws(() => getFileArgsSchema.parse({ path: 123 }));
  assert.throws(() => writeFileArgsSchema.parse({ path: "note.md" }));
  assert.throws(() =>
    appendFileArgsSchema.parse({ path: "note.md", content: null }),
  );
  assert.throws(() => deleteFileArgsSchema.parse({ path: undefined }));
});

test("MCP search and graph schemas enforce bounded values", () => {
  assert.equal(searchVaultArgsSchema.parse({ query: "test" }).limit, undefined);
  assert.throws(() =>
    searchVaultArgsSchema.parse({ query: "test", limit: 101 }),
  );
  assert.throws(() =>
    getLinkedNotesArgsSchema.parse({
      path: "note.md",
      direction: "sideways",
    }),
  );
  assert.throws(() =>
    getLinkedNotesArgsSchema.parse({ path: "note.md", depth: 4 }),
  );
  assert.deepEqual(
    getLinkedNotesArgsSchema.parse({
      path: "note.md",
      direction: "outgoing",
      depth: 2,
      limit: 50,
    }),
    {
      path: "note.md",
      direction: "outgoing",
      depth: 2,
      limit: 50,
    },
  );
});
