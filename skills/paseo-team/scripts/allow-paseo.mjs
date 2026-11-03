// Run by the user, not the agent: Claude Code blocks agents from widening
// their own permissions. Adds only the two Paseo rules paseo-team needs.
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rules = [
  "mcp__paseo__create_agent",
  "mcp__paseo__send_agent_prompt",
];

function projectRoot(start) {
  const git = spawnSync("git", ["-C", start, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  return git.status === 0 ? git.stdout.trim() : path.resolve(start);
}

function load(file) {
  let text;
  try {
    if (lstatSync(file).isSymbolicLink()) throw new Error("拒绝修改符号链接。");
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    // JSON.parse messages quote the input, which may contain secrets.
    throw new Error("settings.local.json 不是有效 JSON，未做任何修改。");
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings))
    throw new Error("settings.local.json 不是 JSON 对象。");
  return settings;
}

export function allowPaseo(root, { check = false } = {}) {
  const file = path.join(root, ".claude", "settings.local.json");
  const settings = load(file);
  const allow = settings.permissions?.allow ?? [];
  if (!Array.isArray(allow)) throw new Error("permissions.allow 不是数组。");
  const missing = rules.filter((rule) => !allow.includes(rule));
  if (check || missing.length === 0) return { file, missing };
  settings.permissions = {
    ...settings.permissions,
    allow: [...allow, ...missing],
  };
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
    flag: "wx",
  });
  renameSync(temporary, file);
  return { file, missing, added: missing };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const check = process.argv.includes("--check");
  const target =
    process.argv.slice(2).find((arg) => arg !== "--check") ?? process.cwd();
  try {
    const root = projectRoot(target);
    const result = allowPaseo(root, { check });
    if (check) {
      console.log(
        result.missing.length ? `MISSING ${result.missing.join(" ")}` : "OK",
      );
      process.exitCode = result.missing.length ? 1 : 0;
    } else {
      console.log(
        result.added
          ? `已添加 ${result.added.join("、")} 到 ${result.file}`
          : `无需修改：${result.file} 已包含这两条规则`,
      );
      const ignored = spawnSync("git", [
        "-C",
        root,
        "check-ignore",
        "-q",
        result.file,
      ]);
      if (ignored.status === 1)
        console.log("注意：该文件没有被 git 忽略，请不要把它提交到仓库。");
    }
  } catch (error) {
    // Never echo file contents: settings may hold env values.
    console.log(`ERROR ${error.message}`);
    process.exitCode = 2;
  }
}
