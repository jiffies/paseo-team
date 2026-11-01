import { spawnSync } from "node:child_process";
import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";

const tailBytes = 8192;
const tailCharacters = 2000;

function publicLogPath(file) {
  if (typeof file !== "string" || !file.trim())
    throw new Error("需要 --log 指向任务证据目录中的新日志。");
  const absolute = path.resolve(file);
  const sensitive = absolute
    .replaceAll("\\", "/")
    .split("/")
    .some(
      (part) =>
        /^\.env(?:\.|$)/i.test(part) ||
        [".ssh", ".aws", ".gnupg", ".paseo", ".credentials"].includes(part) ||
        /^(?:auth|credentials?|secrets?)(?:\.|$)/i.test(part),
    );
  if (sensitive || path.extname(absolute) !== ".log")
    throw new Error("检查日志必须是公开任务目录中的 .log 文件，禁止凭据路径。");
  return absolute;
}

function readTail(fd, size) {
  const bytes = Math.min(size, tailBytes);
  const buffer = Buffer.alloc(bytes);
  const count = readSync(fd, buffer, 0, bytes, size - bytes);
  let text = buffer.subarray(0, count).toString("utf8");
  text = stripVTControlCharacters(text).replaceAll("\r", "\n");
  return {
    outputTail: text.slice(-tailCharacters),
    truncated: size > bytes || text.length > tailCharacters,
  };
}

// Only ordinary, credential-isolated checks belong here. No shell interpolation,
// environment dump, command echo, dotenv loading, or reading pre-existing logs.
export function runCheck(command, args, { log, cwd = process.cwd() } = {}) {
  if (typeof command !== "string" || !command || !Array.isArray(args))
    throw new Error("需要 -- 后的可执行程序及其参数。");
  const requested = publicLogPath(log);
  const resolved = publicLogPath(
    path.join(realpathSync(path.dirname(requested)), path.basename(requested)),
  );
  // Exclusive creation also rejects an existing file or a leaf symlink.
  const fd = openSync(resolved, "wx+", 0o600);
  try {
    const child = spawnSync(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        SKIP_DOTENV: "true",
        DOTENV_CONFIG_PATH: process.platform === "win32" ? "NUL" : "/dev/null",
      },
    });
    const exitCode = child.status;
    const signal = child.signal ?? null;
    const processExitCode = child.error
      ? child.error.code === "ENOENT"
        ? 127
        : 1
      : signal
        ? 128 + (os.constants.signals[signal] ?? 0)
        : (exitCode ?? 1);
    const status = child.error
      ? "ERROR"
      : processExitCode === 0
        ? "PASS"
        : "FAIL";
    const result = {
      status,
      exitCode,
      signal,
      processExitCode,
      logPath: resolved,
    };
    if (child.error)
      result.message =
        child.error.code === "ENOENT"
          ? "无法启动检查：可执行程序不存在。"
          : "无法执行检查；未回显命令参数或环境。";
    if (status !== "PASS")
      Object.assign(result, readTail(fd, fstatSync(fd).size));
    return result;
  } finally {
    closeSync(fd);
  }
}

export function main(argv) {
  const separator = argv.indexOf("--");
  const { values } = parseArgs({
    args: separator < 0 ? argv : argv.slice(0, separator),
    options: { log: { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help)
    return {
      usage:
        "node run-check.mjs --log /task-evidence/check.log -- executable arg...",
      note: "只用于普通本地检查。日志目录需已存在；日志不可覆盖。成功只报状态，失败显示最多 2000 字符的末尾输出；完整 stdout/stderr 保存到日志。真实凭据/API 验证不可使用此工具。",
    };
  if (separator < 0 || argv.length <= separator + 1)
    throw new Error("需要 -- 后的可执行程序及其参数。");
  return runCheck(argv[separator + 1], argv.slice(separator + 2), {
    log: values.log,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = main(process.argv.slice(2));
    console.log(JSON.stringify(result));
    process.exitCode = result.processExitCode ?? 0;
  } catch {
    console.error(
      JSON.stringify({
        status: "ERROR",
        message:
          "检查工具失败：核对参数、日志目录及文件是否已存在；未回显文件内容或命令参数。运行 --help 查看用法。",
      }),
    );
    process.exitCode = 1;
  }
}
