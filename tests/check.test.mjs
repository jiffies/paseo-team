import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkRepository,
  validateMarkdownLinks,
  validateMarkdownStyle,
  validateSkillFrontmatter,
} from "../scripts/check.mjs";

const validSkill = `---
name: paseo-team
description: |
  通过独立 Agent 审查方案与交付。
argument-hint: "<目标与约束>"
disable-model-invocation: true
allowed-tools: Read
---
# Paseo Team

先整理需求，再进行独立分析与验证。
`;

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "paseo-team-check-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "repository");
  await mkdir(root);
  const references = path.join(root, "skills", "paseo-team", "references");
  await mkdir(references, { recursive: true });
  for (const name of ["review.md", "tools.md", "configuration.md"]) {
    await writeFile(path.join(references, name), "# 参考\n");
  }
  const agents = path.join(root, "skills", "paseo-team", "agents");
  await mkdir(agents);
  await writeFile(
    path.join(agents, "openai.yaml"),
    "policy:\n  allow_implicit_invocation: false\n",
  );
  return { directory, root, sourceFile: path.join(root, "README.md") };
}

test("接受真实 YAML 的多行文本和 Claude 扩展字段", () => {
  assert.deepEqual(validateSkillFrontmatter(validSkill), []);
});

test("拒绝损坏、重复、类型错误和缺失的 frontmatter", () => {
  const invalidSources = [
    validSkill.replace("name: paseo-team", "name: ["),
    validSkill.replace("name: paseo-team", "name: paseo-team\nname: duplicate"),
    validSkill.replace(
      "disable-model-invocation: true",
      'disable-model-invocation: "true"',
    ),
    validSkill.replace("name: paseo-team", "name: another-skill"),
    validSkill.replace("allowed-tools: Read", "context: fork"),
    validSkill.replace('argument-hint: "<目标与约束>"\n', ""),
    validSkill.replace(
      "description: |\n  通过独立 Agent 审查方案与交付。",
      "description: []",
    ),
    "# 没有元数据",
    "---\n- paseo-team\n---\n正文",
  ];
  for (const source of invalidSources) {
    assert.ok(validateSkillFrontmatter(source).length > 0);
  }
});

test("拒绝空正文与未填完的模板", () => {
  assert.ok(
    validateSkillFrontmatter(validSkill.split("# Paseo Team")[0]).length,
  );
  assert.ok(validateSkillFrontmatter(`${validSkill}\n{{未填写}}\n`).length);
});

test("解析行内、引用式和图片链接，忽略代码示例与外部网址", async (t) => {
  const { root, sourceFile } = await fixture(t);
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs", "设计 (版本).md"), "# 设计\n");
  await writeFile(path.join(root, "diagram.svg"), "<svg></svg>");
  const source = `
[说明](<docs/设计 (版本).md#结构>)
[引用][design]
![图片](diagram.svg)
[站外](https://example.com/a)
[邮件](mailto:someone@example.com)
[章节](#章节)

[design]: docs/%E8%AE%BE%E8%AE%A1%20%28%E7%89%88%E6%9C%AC%29.md "说明"

\`[代码示例](不存在.md)\`

\`\`\`markdown
[另一示例](仍不存在.md)
\`\`\`
`;
  assert.deepEqual(await validateMarkdownLinks(source, sourceFile, root), []);
  assert.ok(
    (
      await validateMarkdownLinks(
        "[缺失][ref]\n\n[ref]: absent.md",
        sourceFile,
        root,
      )
    ).length,
  );
});

test("拒绝不存在、编码异常、敏感路径与越出仓库的链接", async (t) => {
  const { root, sourceFile } = await fixture(t);
  for (const target of [
    "missing.md",
    "../outside.md",
    "%2e%2e/outside.md",
    "/absolute.md",
    ".env",
    "docs/.env.local",
    ".ssh/id_rsa",
    "docs/%E0%A4%A",
  ]) {
    assert.ok(
      (await validateMarkdownLinks(`[目标](<${target}>)`, sourceFile, root))
        .length,
      target,
    );
  }
});

test("拒绝通过符号链接读取仓库外文档或访问链接目标", async (t) => {
  const { directory, root, sourceFile } = await fixture(t);
  const outside = path.join(directory, "outside.md");
  await writeFile(outside, "# 仓库之外\n");
  await symlink(outside, sourceFile);
  await mkdir(path.join(root, "skills", "paseo-team"), { recursive: true });
  await mkdir(path.join(root, "docs"));
  await writeFile(
    path.join(root, "skills", "paseo-team", "SKILL.md"),
    validSkill,
  );
  await writeFile(path.join(root, "docs", "verification.md"), "# 验证\n");
  assert.ok(
    (await validateMarkdownLinks("[目标](README.md)", sourceFile, root)).length,
  );
  assert.equal((await checkRepository(root)).length, 1);
});

test("完整仓库验证仅要求明确列出的公开文档", async (t) => {
  const { root } = await fixture(t);
  await mkdir(path.join(root, "skills", "paseo-team"), { recursive: true });
  await mkdir(path.join(root, "docs"));
  await writeFile(
    path.join(root, "README.md"),
    "# 项目\n\n[验证](docs/verification.md)\n",
  );
  await writeFile(
    path.join(root, "skills", "paseo-team", "SKILL.md"),
    validSkill,
  );
  await writeFile(path.join(root, "docs", "verification.md"), "# 验证\n");
  await writeFile(
    path.join(root, "unrelated.md"),
    "[故意未提供](missing.md)\n",
  );
  assert.deepEqual(await checkRepository(root), []);
});

test("Markdown lint API 接受规范正文并拒绝无空格标题", async () => {
  assert.deepEqual(await validateMarkdownStyle("# 标题\n\n正文。\n"), []);
  assert.ok((await validateMarkdownStyle("#缺少空格\n")).length);
});
