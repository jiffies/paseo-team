import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("../skills/paseo-team/scripts/allow-paseo.mjs", import.meta.url),
);
const rules = ["mcp__paseo__create_agent", "mcp__paseo__send_agent_prompt"];

async function project(t, settings) {
  const root = await mkdtemp(path.join(os.tmpdir(), "allow-paseo-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, ".claude", "settings.local.json");
  if (settings !== undefined) {
    await mkdir(path.dirname(file));
    await writeFile(file, settings);
  }
  return { root, file };
}

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
  return { code: result.status, out: result.stdout };
}

test("creates settings with only the two rules when missing", async (t) => {
  const { root, file } = await project(t);
  assert.equal(run("--check", root).code, 1);
  assert.equal(run(root).code, 0);
  const settings = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(settings, { permissions: { allow: rules } });
  assert.equal(run("--check", root).code, 0);
});

test("appends missing rules, keeps everything else and is idempotent", async (t) => {
  const original = {
    env: { TOKEN: "do-not-print" },
    permissions: { allow: ["Bash(ls)", rules[1]], deny: ["Read(.env)"] },
  };
  const { root, file } = await project(t, JSON.stringify(original));
  const first = run(root);
  assert.equal(first.code, 0);
  assert.doesNotMatch(first.out, /do-not-print/);
  const once = await readFile(file, "utf8");
  assert.deepEqual(JSON.parse(once), {
    ...original,
    permissions: {
      ...original.permissions,
      allow: ["Bash(ls)", ...rules.toReversed()],
    },
  });
  assert.equal(run(root).code, 0);
  assert.equal(await readFile(file, "utf8"), once);
});

test("invalid JSON is left untouched and never echoed", async (t) => {
  const broken = '{"env": {"TOKEN": "do-not-print"},';
  const { root, file } = await project(t, broken);
  const result = run(root);
  assert.equal(result.code, 2);
  assert.doesNotMatch(result.out, /do-not-print/);
  assert.equal(await readFile(file, "utf8"), broken);
});
