import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const operationFiles = [
  "MERGE_HEAD",
  "REBASE_HEAD",
  "rebase-apply",
  "rebase-merge",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "sequencer",
  "BISECT_LOG",
  "BISECT_START",
  "index.lock",
];
const commitId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function runGit(cwd, args, allowed = [0]) {
  const result = spawnSync("git", ["--no-optional-locks", "-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || !allowed.includes(result.status)) {
    throw new Error(
      `Git ${args[0]} failed (${result.status ?? "unavailable"}).`,
    );
  }
  return { code: result.status, text: result.stdout.trim() };
}

function checkout(directory) {
  const root = realpathSync(
    runGit(path.resolve(directory), ["rev-parse", "--show-toplevel"]).text,
  );
  const common = realpathSync(
    path.resolve(root, runGit(root, ["rev-parse", "--git-common-dir"]).text),
  );
  return {
    root,
    common,
    head: runGit(root, ["rev-parse", "HEAD"]).text,
    branch: runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1])
      .text,
    clean:
      runGit(root, ["status", "--porcelain=v1", "--untracked-files=normal"])
        .text === "",
    operations: operationFiles.filter((name) =>
      existsSync(
        path.resolve(
          root,
          runGit(root, ["rev-parse", "--git-path", name]).text,
        ),
      ),
    ),
  };
}

export function inspect(options) {
  if (!commitId.test(options.base) || !commitId.test(options.candidate)) {
    throw new Error("Use full commit IDs for --base and --candidate.");
  }
  const main = checkout(options.main);
  const task = checkout(options.task);
  const candidate = runGit(main.root, [
    "rev-parse",
    "--verify",
    `${options.candidate}^{commit}`,
  ]).text;
  const base = runGit(main.root, [
    "rev-parse",
    "--verify",
    `${options.base}^{commit}`,
  ]).text;
  const checks = {
    sameRepository: main.common === task.common,
    separateWorktrees: main.root !== task.root,
    mainBranch: main.branch === "main",
    taskBranch: Boolean(task.branch) && task.branch !== "main",
    mainAtBase: main.head === base,
    taskAtCandidate: task.head === candidate,
    candidateContainsBase:
      runGit(
        main.root,
        ["merge-base", "--is-ancestor", base, candidate],
        [0, 1],
      ).code === 0,
    mainClean: main.clean,
    taskClean: task.clean,
    mainIdle: main.operations.length === 0,
    taskIdle: task.operations.length === 0,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "READY" : "BLOCKED",
    base,
    candidate,
    candidateTree: runGit(main.root, ["rev-parse", `${candidate}^{tree}`]).text,
    main,
    task,
    checks,
  };
}

function lockPaths(common) {
  const legacy = path.join(common, "herdr-main-publish.lock");
  const locks = [
    ...(existsSync(legacy) ? [legacy] : []),
    path.join(common, "main-publish.lock"),
  ];
  for (const file of locks) {
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("Publish lock must be a regular file.");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return locks;
}

// Called by the child process inside flock. This is a mechanical check, not
// an authorization or review gate. Acceptance is the caller's responsibility.
export function advanceUnderLock(options) {
  const before = inspect(options);
  if (before.status !== "READY") return { code: 1, report: before };
  const merge = runGit(
    before.main.root,
    ["merge", "--ff-only", "--no-edit", before.candidate],
    [0, 1, 128],
  );
  const after = inspect({ ...options, base: before.candidate });
  const success = merge.code === 0 && after.status === "READY";
  return {
    code: success ? 0 : 1,
    report: {
      status: success ? "FAST_FORWARDED" : "POST_MERGE_CHECK_FAILED",
      mergeExitCode: merge.code,
      before,
      after,
    },
  };
}

export function merge(options) {
  const before = inspect(options);
  if (before.status !== "READY") return { code: 1, report: before };
  if (process.platform !== "linux") {
    throw new Error("Automatic merge requires Linux/WSL and flock.");
  }
  const locks = lockPaths(before.main.common);
  // Arguments go directly to exec; no shell interpolation or generated files.
  const program = `import { advanceUnderLock } from ${JSON.stringify(import.meta.url)};
try {
  const result = advanceUnderLock(JSON.parse(process.argv[1]));
  console.log(JSON.stringify(result.report, null, 2));
  process.exitCode = result.code;
} catch (error) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: error.message }));
  process.exitCode = 1;
}`;
  let command = [
    process.execPath,
    "--input-type=module",
    "-e",
    program,
    JSON.stringify(options),
  ];
  for (const lock of locks.toReversed()) {
    command = [
      "flock",
      "--exclusive",
      "--nonblock",
      "--conflict-exit-code",
      "75",
      lock,
      ...command,
    ];
  }
  const result = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.signal) {
    throw new Error("Publish lock command unavailable or interrupted.");
  }
  if (result.status === 75) {
    return { code: 75, report: { status: "LOCK_BUSY", locks } };
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("Publish helper failed without a valid result.");
  }
  return { code: result.status, report: { ...report, locks } };
}

function parseArguments(args) {
  const [action, ...rest] = args;
  if (!["inspect", "merge"].includes(action)) {
    throw new Error(
      "Usage: workflow.mjs inspect|merge --main PATH --task PATH --base SHA --candidate SHA",
    );
  }
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    if (
      !rest[i]?.startsWith("--") ||
      !["main", "task", "base", "candidate"].includes(key) ||
      !rest[i + 1] ||
      options[key]
    ) {
      throw new Error("Invalid, duplicate or missing argument.");
    }
    options[key] = rest[i + 1];
  }
  if (Object.keys(options).length !== 4) {
    throw new Error("Require --main, --task, --base and --candidate.");
  }
  return { action, options };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { action, options } = parseArguments(process.argv.slice(2));
    const result =
      action === "merge" ? merge(options) : { report: inspect(options) };
    console.log(JSON.stringify(result.report, null, 2));
    process.exitCode =
      result.code ?? (result.report.status === "READY" ? 0 : 1);
  } catch (error) {
    console.log(JSON.stringify({ status: "BLOCKED", reason: error.message }));
    process.exitCode = 1;
  }
}
