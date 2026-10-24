import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { lint } from "markdownlint/promise";
import { parseDocument } from "yaml";

// 只读取明确列出的公开文档，不扫描目录或读取环境/凭据文件。
export const markdownSources = Object.freeze([
  "README.md",
  "skills/paseo-team/SKILL.md",
  "docs/verification.md",
  "skills/paseo-team/references/review.md",
  "skills/paseo-team/references/tools.md",
  "skills/paseo-team/references/configuration.md",
]);

const markdown = new MarkdownIt();
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const markdownLintConfig = Object.freeze({
  default: true,
  MD013: false,
  MD024: { siblings_only: true },
  MD033: false,
  MD036: false,
  MD060: false,
});

export async function validateMarkdownStyle(source, name = "document.md") {
  const result = await lint({
    strings: { [name]: source },
    config: markdownLintConfig,
  });
  return result[name];
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function isSensitivePath(target) {
  return target
    .replaceAll("\\", "/")
    .split("/")
    .some(
      (segment) =>
        /^\.env(?:\.|$)/i.test(segment) ||
        [".aws", ".ssh", ".gnupg", ".credentials"].includes(segment) ||
        /\.(?:pem|key|p12|pfx)$/i.test(segment),
    );
}

export function validateSkillFrontmatter(source) {
  const errors = [];
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) {
    return ["Skill 必须以完整的 YAML frontmatter 开头。"];
  }

  const document = parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length > 0) {
    return ["Skill frontmatter 不是有效 YAML，或包含重复字段。"];
  }

  let metadata;
  try {
    metadata = document.toJS({ maxAliasCount: 20 });
  } catch {
    return ["Skill frontmatter 无法解析为元数据。"];
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return ["Skill frontmatter 必须是 YAML 映射。"];
  }

  if (metadata.name !== "paseo-team") {
    errors.push("Skill name 必须为 paseo-team。");
  }
  for (const field of ["description", "argument-hint"]) {
    if (typeof metadata[field] !== "string" || !metadata[field].trim()) {
      errors.push(`Skill ${field} 必须为非空字符串。`);
    }
  }
  if (metadata["disable-model-invocation"] !== true) {
    errors.push("Skill disable-model-invocation 必须为布尔值 true。");
  }

  if (metadata.context === "fork") {
    errors.push("paseo-team 必须由当前主会话主持，不能配置 context: fork。");
  }

  const body = source.slice(match[0].length).trim();
  if (!body) {
    errors.push("Skill 正文不能为空。");
  }
  if (/\b(?:TODO|TBD|FIXME|REPLACE_ME)\b|\{\{[^{}]+\}\}/.test(body)) {
    errors.push("Skill 正文含有明显的未完成模板占位。");
  }
  return errors;
}

function collectDestinations(tokens, result = []) {
  for (const token of tokens) {
    if (token.type === "link_open") {
      result.push(token.attrGet("href"));
    } else if (token.type === "image") {
      result.push(token.attrGet("src"));
    }
    if (token.children) {
      collectDestinations(token.children, result);
    }
  }
  return result;
}

export async function validateMarkdownLinks(source, sourceFile, root) {
  const errors = [];
  const resolvedRoot = await realpath(root);
  for (const destination of new Set(
    collectDestinations(markdown.parse(source, {})),
  )) {
    if (!destination || destination.startsWith("#")) {
      continue;
    }
    if (
      /^[a-z][a-z\d+.-]*:/i.test(destination) &&
      !/^[a-z]:[\\/]/i.test(destination)
    ) {
      continue;
    }
    if (destination.startsWith("//")) {
      continue;
    }

    let localPath;
    try {
      localPath = decodeURIComponent(
        destination.split(/[?#]/, 1)[0],
      ).replaceAll("\\", "/");
    } catch {
      errors.push(`链接包含无效的 URL 编码：${destination}`);
      continue;
    }
    if (!localPath) {
      continue;
    }
    if (
      path.isAbsolute(localPath) ||
      /^[a-z]:\//i.test(localPath) ||
      localPath.includes("\0")
    ) {
      errors.push(`本地链接必须使用仓库内的相对路径：${destination}`);
      continue;
    }

    const target = path.resolve(path.dirname(sourceFile), localPath);
    if (!isWithin(root, target)) {
      errors.push(`相对链接越出仓库：${destination}`);
      continue;
    }
    if (isSensitivePath(localPath)) {
      errors.push("文档链接指向敏感文件或凭据目录，未访问该目标。");
      continue;
    }
    try {
      const resolvedTarget = await realpath(target);
      if (!isWithin(resolvedRoot, resolvedTarget)) {
        errors.push(`相对链接通过符号链接越出仓库：${destination}`);
      } else if (isSensitivePath(resolvedTarget)) {
        errors.push("文档链接指向敏感文件或凭据目录，未读取该目标。");
      }
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        errors.push(`相对链接目标不存在：${destination}`);
      } else {
        errors.push(`无法核对相对链接目标：${destination}`);
      }
    }
  }
  return errors;
}

export async function checkRepository(
  root = repositoryRoot,
  { lintOnly = false } = {},
) {
  const errors = [];
  const resolvedRoot = await realpath(root);
  if (!lintOnly) {
    try {
      const metadataPath = await realpath(
        path.join(root, "skills/paseo-team/agents/openai.yaml"),
      );
      if (
        !isWithin(resolvedRoot, metadataPath) ||
        isSensitivePath(metadataPath)
      )
        throw new Error("无效路径");
      const document = parseDocument(await readFile(metadataPath, "utf8"), {
        uniqueKeys: true,
      });
      if (
        document.errors.length ||
        document.toJS({ maxAliasCount: 20 })?.policy
          ?.allow_implicit_invocation !== false
      ) {
        errors.push(
          "Codex 元数据必须设置 policy.allow_implicit_invocation: false。",
        );
      }
    } catch {
      errors.push("Codex 元数据不存在、不可读或无效。");
    }
  }
  for (const relative of markdownSources) {
    const sourceFile = path.resolve(root, relative);
    let source;
    try {
      const resolvedFile = await realpath(sourceFile);
      if (
        !isWithin(resolvedRoot, resolvedFile) ||
        isSensitivePath(resolvedFile)
      ) {
        errors.push(`${relative}：公开文档不能指向仓库之外或敏感文件。`);
        continue;
      }
      source = await readFile(sourceFile, "utf8");
    } catch {
      errors.push(`${relative}：必需文档不存在或无法读取。`);
      continue;
    }
    if (lintOnly) {
      for (const issue of await validateMarkdownStyle(source, relative)) {
        errors.push(
          `${relative}:${issue.lineNumber} ${issue.ruleNames[0]} ${issue.ruleDescription}`,
        );
      }
      continue;
    }
    if (relative === "skills/paseo-team/SKILL.md") {
      errors.push(
        ...validateSkillFrontmatter(source).map(
          (message) => `${relative}：${message}`,
        ),
      );
    }
    errors.push(
      ...(await validateMarkdownLinks(source, sourceFile, root)).map(
        (message) => `${relative}：${message}`,
      ),
    );
  }
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const lintOnly = process.argv.includes("--lint");
  const errors = await checkRepository(repositoryRoot, { lintOnly });
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
  } else {
    console.log(
      lintOnly
        ? `通过：${markdownSources.length} 份公开文档的 Markdown lint 检查。`
        : "通过：Skill 元数据、模板残留及公开文档的本地链接检查。",
    );
  }
}
