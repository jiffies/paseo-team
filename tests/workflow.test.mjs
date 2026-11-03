import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Fixture repositories never use personal credentials, hooks or Git config.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.GIT_TERMINAL_PROMPT = "0";
process.env.SKIP_DOTENV = "true";
process.env.DOTENV_CONFIG_PATH = "/dev/null";

const helper = fileURLToPath(
  new URL("../skills/paseo-team/scripts/workflow.mjs", import.meta.url),
);
function git(cwd, ...args) {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "paseo workflow "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const main = path.join(directory, "main checkout");
  const task = path.join(directory, "task checkout");
  git(directory, "init", "-b", "main", main);
  await writeFile(path.join(main, "base.txt"), "base\n");
  git(main, "add", "--", "base.txt");
  git(main, "commit", "-m", "baseline");
  const base = git(main, "rev-parse", "HEAD");
  git(main, "worktree", "add", "-b", "task/example", task);
  await writeFile(path.join(task, "feature.txt"), "candidate\n");
  git(task, "add", "--", "feature.txt");
  git(task, "commit", "-m", "feature");
  return {
    directory,
    main,
    task,
    base,
    candidate: git(task, "rev-parse", "HEAD"),
  };
}

function invoke(action, options) {
  const result = spawnSync(
    process.execPath,
    [
      helper,
      action,
      ...["main", "task", "base", "candidate"].flatMap((key) => [
        `--${key}`,
        options[key],
      ]),
    ],
    { encoding: "utf8" },
  );
  return { code: result.status, report: JSON.parse(result.stdout) };
}

test("inspect binds the exact candidate without modifying main", async (t) => {
  const f = await fixture(t);
  const result = invoke("inspect", f);
  assert.equal(result.code, 0);
  assert.equal(
    result.report.candidateTree,
    git(f.task, "rev-parse", "HEAD^{tree}"),
  );
  assert.equal(result.report.main.head, f.base);
  assert.equal(result.report.task.head, f.candidate);
  assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
});

test("merge fast-forwards the checked candidate, including paths with spaces", async (t) => {
  const f = await fixture(t);
  git(f.main, "worktree", "lock", "--reason", "paseo-team task", f.task);
  const result = invoke("merge", f);
  assert.equal(result.code, 0);
  assert.equal(result.report.status, "FAST_FORWARDED");
  assert.equal(result.report.worktreeUnlocked, true);
  assert.doesNotMatch(git(f.main, "worktree", "list"), /locked/);
  assert.equal(path.basename(result.report.lock), "main-publish.lock");
  assert.equal(git(f.main, "rev-parse", "HEAD"), f.candidate);
  assert.equal(
    await readFile(path.join(f.main, "feature.txt"), "utf8"),
    "candidate\n",
  );
});

test("stale main or changed candidate never gets merged", async (t) => {
  for (const side of ["main", "task"]) {
    const f = await fixture(t);
    await writeFile(path.join(f[side], "new.txt"), "unreviewed\n");
    git(f[side], "add", "--", "new.txt");
    git(f[side], "commit", "-m", "advanced");
    const head = git(f.main, "rev-parse", "HEAD");
    assert.equal(invoke("merge", f).code, 1);
    assert.equal(git(f.main, "rev-parse", "HEAD"), head);
  }
});

test("dirty or untracked files in either checkout are preserved and block merge", async (t) => {
  for (const side of ["main", "task"]) {
    for (const file of ["base.txt", "untracked.txt"]) {
      const f = await fixture(t);
      await writeFile(path.join(f[side], file), "user work\n");
      const result = invoke("merge", f);
      assert.equal(result.code, 1);
      assert.equal(result.report.checks[`${side}Clean`], false);
      assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
      assert.equal(
        await readFile(path.join(f[side], file), "utf8"),
        "user work\n",
      );
    }
  }
});

test("in-progress task operation, unrelated repo, and same checkout are rejected", async (t) => {
  const f = await fixture(t);
  const mergeHead = path.resolve(
    f.task,
    git(f.task, "rev-parse", "--git-path", "MERGE_HEAD"),
  );
  await writeFile(mergeHead, `${f.base}\n`);
  assert.equal(invoke("merge", f).report.checks.taskIdle, false);
  await rm(mergeHead);
  const other = await fixture(t);
  assert.equal(
    invoke("merge", { ...f, task: other.task }).report.checks.sameRepository,
    false,
  );
  assert.equal(
    invoke("merge", { ...f, task: f.main }).report.checks.separateWorktrees,
    false,
  );
  assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
});

test("candidate on a different history cannot be merged", async (t) => {
  const f = await fixture(t);
  git(f.task, "checkout", "--orphan", "other-history");
  git(f.task, "add", "--", "base.txt", "feature.txt");
  git(f.task, "commit", "-m", "unrelated root");
  const result = invoke("merge", {
    ...f,
    candidate: git(f.task, "rev-parse", "HEAD"),
  });
  assert.equal(result.report.checks.candidateContainsBase, false);
  assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
});

test("unlocked task worktree merges and reports no unlock", async (t) => {
  const f = await fixture(t);
  const result = invoke("merge", f);
  assert.equal(result.code, 0);
  assert.equal(result.report.worktreeUnlocked, false);
});

test("a publish lock holder blocks competing merges", async (t) => {
  const f = await fixture(t);
  const lock = path.join(f.main, ".git", "main-publish.lock");
  const holder = spawn(
    "flock",
    [
      lock,
      process.execPath,
      "-e",
      "process.stdout.write('locked'); process.stdin.resume();",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = once(holder, "exit");
  try {
    await once(holder.stdout, "data");
    const result = invoke("merge", f);
    assert.equal(result.code, 75);
    assert.equal(result.report.status, "LOCK_BUSY");
    assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
  } finally {
    holder.stdin.end();
    await exited;
  }
  assert.equal(invoke("merge", f).code, 0);
});

test("post-merge hook changes are reported without reset, cleanup or unlock", async (t) => {
  const f = await fixture(t);
  git(f.main, "worktree", "lock", f.task);
  const hook = path.join(f.main, ".git", "hooks", "post-merge");
  await writeFile(hook, "#!/bin/sh\nprintf 'hook change\\n' > base.txt\n");
  await chmod(hook, 0o755);
  const result = invoke("merge", f);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, "POST_MERGE_CHECK_FAILED");
  assert.equal(result.report.worktreeUnlocked, false);
  assert.match(git(f.main, "worktree", "list"), /locked/);
  assert.equal(git(f.main, "rev-parse", "HEAD"), f.candidate);
  assert.equal(
    await readFile(path.join(f.main, "base.txt"), "utf8"),
    "hook change\n",
  );
});

test("abbreviated or option-like commit IDs are rejected", async (t) => {
  const f = await fixture(t);
  for (const candidate of [f.candidate.slice(0, 7), "--help"]) {
    assert.equal(invoke("merge", { ...f, candidate }).code, 1);
    assert.equal(git(f.main, "rev-parse", "HEAD"), f.base);
  }
});

test("stale REBASE_HEAD after a finished rebase does not block merge", async (t) => {
  const f = await fixture(t);
  const stale = path.resolve(
    f.task,
    git(f.task, "rev-parse", "--git-path", "REBASE_HEAD"),
  );
  await writeFile(stale, `${f.base}\n`);
  assert.equal(invoke("merge", f).code, 0);
});

test("runs through a symlinked skill directory", async (t) => {
  const f = await fixture(t);
  const link = path.join(f.directory, "linked-skill");
  await symlink(path.dirname(helper), link);
  const result = spawnSync(
    process.execPath,
    [
      path.join(link, "workflow.mjs"),
      "inspect",
      ...["main", "task", "base", "candidate"].flatMap((key) => [
        `--${key}`,
        f[key],
      ]),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).status, "READY");
});
