import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  editCodemodeDefault,
  isCodemodePersisted,
  parseCommand,
  persistedScopes,
  ScopedSettingsStore,
} from "./index.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "pi-codemode-"));
const readFile = (path: string) => readFileSync(path, "utf-8");
const cleanupDir = (dir: string) => rmSync(dir, { recursive: true });

// ── action parsing ────────────────────────────────────────────────────────────

test("empty args mean toggle with no persistence", () => {
  assert.deepEqual(parseCommand(""), { ok: true, action: "toggle", scopes: [] });
});

test("bare action exists without persistence", () => {
  assert.deepEqual(parseCommand("on"), { ok: true, action: "on", scopes: [] });
  assert.deepEqual(parseCommand("off"), { ok: true, action: "off", scopes: [] });
});

test("unknown action is an error", () => {
  const parsed = parseCommand("frobnicate");
  assert.equal(parsed.ok, false);
});

// ── scope flags ──────────────────────────────────────────────────────────────

test("-l persists for the project", () => {
  assert.deepEqual(parseCommand("on -l"), { ok: true, action: "on", scopes: ["project"] });
});

test("-g persists globally", () => {
  assert.deepEqual(parseCommand("on -g"), { ok: true, action: "on", scopes: ["global"] });
});

test("flags combine across scopes", () => {
  assert.deepEqual(parseCommand("off -l -g"), {
    ok: true,
    action: "off",
    scopes: ["project", "global"],
  });
});

test("flags may precede the action", () => {
  assert.deepEqual(parseCommand("-g on"), { ok: true, action: "on", scopes: ["global"] });
});

test("repeating a scope flag is not an error", () => {
  assert.deepEqual(parseCommand("on -l -l"), { ok: true, action: "on", scopes: ["project"] });
});

test("unknown flag is an error", () => {
  assert.equal(parseCommand("on -x").ok, false);
});

test("actions are case-insensitive", () => {
  assert.deepEqual(parseCommand("ON -L"), { ok: true, action: "on", scopes: ["project"] });
});

// ── persisted default editing ────────────────────────────────────────────────

test("enabling persistence creates a defaultTools entry from scratch", () => {
  assert.equal(
    editCodemodeDefault(undefined, "enable"),
    JSON.stringify({ defaultTools: ["+codemode"] }, null, 2),
  );
});

test("enabling preserves unrelated settings", () => {
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ theme: "tokyonight", quietStartup: true }, null, 2),
      "enable",
    ),
    JSON.stringify(
      { theme: "tokyonight", quietStartup: true, defaultTools: ["+codemode"] },
      null,
      2,
    ),
  );
});

test("enabling appends to an existing plain defaultTools list", () => {
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ defaultTools: ["read", "bash"] }),
      "enable",
    ),
    JSON.stringify({ defaultTools: ["read", "bash", "+codemode"] }, null, 2),
  );
});

test("enabling an already-persisted codemode writes nothing", () => {
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ defaultTools: ["+codemode"] }),
      "enable",
    ),
    undefined,
  );
});

test("disabling removes the entry and keeps the rest", () => {
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ defaultTools: ["+codemode", "+tool_search"], theme: "dark" }),
      "disable",
    ),
    JSON.stringify({ defaultTools: ["+tool_search"], theme: "dark" }, null, 2),
  );
});

test("disabling the last entry drops the defaultTools key", () => {
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ defaultTools: ["+codemode"], quietStartup: true }),
      "disable",
    ),
    JSON.stringify({ quietStartup: true }, null, 2),
  );
});

test("disabling a now-empty layer removes the file, not an empty shell", () => {
  assert.equal(
    editCodemodeDefault(JSON.stringify({ defaultTools: ["+codemode"] }), "disable"),
    null,
  );
});

test("disabling when codemode was never persisted writes nothing", () => {
  assert.equal(editCodemodeDefault(undefined, "disable"), undefined);
  assert.equal(
    editCodemodeDefault(
      JSON.stringify({ defaultTools: ["+tool_search"] }),
      "disable",
    ),
    undefined,
  );
});

test("a malformed settings file is a hard error, never silently rewritten", () => {
  assert.throws(() => editCodemodeDefault("{not json", "enable"));
  assert.throws(() => editCodemodeDefault("{not json", "disable"));
});

test("a non-array defaultTools is a hard error", () => {
  assert.throws(() =>
    editCodemodeDefault(JSON.stringify({ defaultTools: "codemode" }), "enable"),
  );
});

// ── detecting what is persisted, for status ──────────────────────────────────

test("codemode counts as persisted when the layer enables it", () => {
  assert.equal(isCodemodePersisted(JSON.stringify({ defaultTools: ["+codemode"] })), true);
  assert.equal(isCodemodePersisted(JSON.stringify({ defaultTools: ["codemode"] })), true);
});

test("codemode is not persisted in layers without it", () => {
  assert.equal(isCodemodePersisted(undefined), false);
  assert.equal(isCodemodePersisted("{}"), false);
  assert.equal(isCodemodePersisted(JSON.stringify({ defaultTools: ["+tool_search"] })), false);
});

test("a malformed layer is reported as not persisted", () => {
  assert.equal(isCodemodePersisted("{stale"), false);
});

test("persistedScopes lists layers in project-first order", () => {
  assert.deepEqual(persistedScopes(undefined, undefined), []);
  assert.deepEqual(
    persistedScopes(JSON.stringify({ defaultTools: ["+codemode"] }), undefined),
    ["project"],
  );
  assert.deepEqual(
    persistedScopes(JSON.stringify({ defaultTools: ["+codemode"] }), "{}"),
    ["project"],
  );
  assert.deepEqual(
    persistedScopes(JSON.stringify({ defaultTools: ["+codemode"] }), JSON.stringify({ defaultTools: ["+codemode"] })),
    ["project", "global"],
  );
});

// ── the file-backed settings store ───────────────────────────────────────────

test("store writes a project layer next to the working directory", () => {
  const cwd = tmp();
  const store = new ScopedSettingsStore(cwd, join(cwd, "agent"));

  store.persist("project", "enable");

  const file = readFile(join(cwd, ".pi", "settings.json"));
  assert.deepEqual(JSON.parse(file), {
    defaultTools: ["+codemode"],
  });
  cleanupDir(cwd);
});

test("store writes a global layer in the agent dir", () => {
  const cwd = tmp();
  const agentDir = join(cwd, "agent");
  const store = new ScopedSettingsStore(cwd, agentDir);

  store.persist("global", "enable");

  const file = readFile(join(agentDir, "settings.json"));
  assert.deepEqual(JSON.parse(file), { defaultTools: ["+codemode"] });
  cleanupDir(cwd);
});

test("store reads back what it wrote", () => {
  const cwd = tmp();
  const store = new ScopedSettingsStore(cwd, join(cwd, "agent"));

  store.persist("project", "enable");
  assert.equal(store.read("project"), JSON.stringify({ defaultTools: ["+codemode"] }, null, 2));
  assert.equal(store.read("global"), undefined);

  store.persist("project", "disable");
  assert.equal(existsSync(join(cwd, ".pi", "settings.json")), false);
  cleanupDir(cwd);
});

test("store refuses to rewrite a malformed layer", () => {
  const cwd = tmp();
  const store = new ScopedSettingsStore(cwd, join(cwd, "agent"));
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), "{stale");

  assert.throws(() => store.persist("project", "enable"));

  assert.equal(readFile(join(cwd, ".pi", "settings.json")), "{stale");
  cleanupDir(cwd);
});
