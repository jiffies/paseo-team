import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, stat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  createDraft,
  normalizeProfiles,
  resolveTeam,
  validateConfig,
  checkBindings,
  updateConfig,
  readConfig,
  readJson,
  freezeTeam,
  main,
} from "../skills/paseo-team/scripts/team.mjs";

const profiles = [
  {
    id: "dev-c",
    name: "Developer",
    provider: "codex",
    model: "test-codex",
    modeId: "full-access",
    thinkingOptionId: "high",
    featureValues: { web: true },
  },
  { id: "qa-c", name: "QA", provider: "codex", model: "test-codex" },
  { id: "qa-a", name: "Architect", provider: "claude", model: "test-claude" },
  {
    id: "dev-d",
    name: "DeepSeek Developer",
    provider: "deepseek",
    model: "test-deepseek",
  },
  {
    id: "qa-d",
    name: "DeepSeek Reviewer",
    provider: "deepseek",
    model: "test-deepseek",
  },
];
function configured() {
  const c = createDraft(profiles);
  c.aliases.deepseek = { developer: "dev-d", reviewer: "qa-d" };
  c.byLead.codex = {
    developer: "deepseek",
    reviewTeams: {
      2: ["codex", "deepseek"],
      3: ["claude", "codex", "deepseek"],
    },
  };
  c.presets["no-claude"] = { dev: "codex", audit: "codex,deepseek" };
  return c;
}
const names = (members) => members.map((member) => member.alias);
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paseo-team-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = path.join(dir, "config.json");
  const inventory = path.join(dir, "inventory.json");
  const input = path.join(dir, "choices.json");
  await writeFile(inventory, JSON.stringify(profiles));
  await writeFile(input, JSON.stringify(configured()));
  return { dir, config, inventory, input };
}

test("新主会话自动使用各自主控默认，默认不审查", () => {
  const c = configured();
  assert.equal(
    resolveTeam(c, profiles, { lead: "claude" }).developer.alias,
    "codex",
  );
  const team = resolveTeam(c, profiles, { lead: "codex" });
  assert.equal(team.developer.alias, "deepseek");
  assert.deepEqual(team.planReviewers, []);
  assert.deepEqual(team.deliveryReviewers, []);
  assert.equal(
    resolveTeam(c, profiles, { lead: "other" }).developer.alias,
    "codex",
  );
});

test("两人、三人和显式名单均严格保持阶段与人数", () => {
  const c = configured();
  const two = resolveTeam(c, profiles, { lead: "codex", audit: "2" });
  assert.deepEqual(names(two.planReviewers), ["codex", "deepseek"]);
  assert.deepEqual(names(two.deliveryReviewers), ["codex", "deepseek"]);
  const three = resolveTeam(c, profiles, { lead: "codex", review: "3" });
  assert.deepEqual(three.planReviewers, []);
  assert.equal(three.deliveryReviewers.length, 3);
  const plan = resolveTeam(c, profiles, {
    lead: "claude",
    plan: "deepseek,codex",
  });
  assert.deepEqual(names(plan.planReviewers), ["deepseek", "codex"]);
  assert.deepEqual(plan.deliveryReviewers, []);
});

test("null 禁止回退到 Claude 组合，缺少三人组不会擅自补人", () => {
  const c = createDraft(profiles);
  assert.throws(
    () => resolveTeam(c, profiles, { lead: "codex", audit: "2" }),
    /尚未设置/,
  );
  assert.throws(
    () => resolveTeam(c, profiles, { lead: "claude", audit: "3" }),
    /尚未设置/,
  );
  c.byLead.codex.developer = null;
  assert.throws(
    () => resolveTeam(c, profiles, { lead: "codex" }),
    /没有默认开发者/,
  );
});

test("本次参数覆盖 preset 与主控默认；指定阶段替换 preset 的审查范围", () => {
  const c = configured();
  const saved = resolveTeam(c, profiles, {
    lead: "codex",
    preset: "no-claude",
  });
  assert.equal(saved.developer.alias, "codex");
  assert.deepEqual(names(saved.deliveryReviewers), ["codex", "deepseek"]);
  const explicit = resolveTeam(c, profiles, {
    lead: "codex",
    preset: "no-claude",
    dev: "deepseek",
    review: "2",
  });
  assert.equal(explicit.developer.alias, "deepseek");
  assert.deepEqual(explicit.planReviewers, []);
  const simple = resolveTeam(c, profiles, {
    lead: "codex",
    preset: "no-claude",
    audit: "0",
  });
  assert.deepEqual(simple.deliveryReviewers, []);
  assert.deepEqual(simple.planReviewers, []);
});

test("只要求当次所需 Profile；新增 Provider 不需要改解析器", () => {
  const c = configured();
  assert.equal(
    resolveTeam(c, [profiles[0]], { lead: "claude" }).developer.id,
    "dev-c",
  );
  assert.throws(
    () => resolveTeam(c, [profiles[0]], { lead: "claude", review: "2" }),
    /不可用/,
  );
  c.aliases.future = { developer: "dev-f", reviewer: "qa-f" };
  const extra = [
    ...profiles,
    { id: "dev-f", name: "Future Dev", provider: "future" },
    { id: "qa-f", name: "Future QA", provider: "future" },
  ];
  const team = resolveTeam(c, extra, {
    lead: "codex",
    dev: "future",
    review: "codex,future",
  });
  assert.equal(team.developer.provider, "future");
  assert.deepEqual(names(team.deliveryReviewers), ["codex", "future"]);
});

test("无效参数、重复别名和重复 Profile 不被当成有效团队", () => {
  const c = configured();
  for (const options of [
    { audit: "1" },
    { audit: "codex,codex" },
    { audit: "missing,codex" },
    { audit: "2", review: "2" },
    { dev: "claude" },
    { preset: "unknown" },
    { extra: "ignored" },
  ])
    assert.throws(() =>
      resolveTeam(c, profiles, { lead: "codex", ...options }),
    );
  c.aliases.copy = { reviewer: "qa-c" };
  assert.throws(
    () => resolveTeam(c, profiles, { lead: "codex", review: "codex,copy" }),
    /同一 Profile/,
  );
  c.presets.bad = { review: "codex,copy" };
  assert.throws(() => checkBindings(c, profiles), /重复/);
});

test("配置不接受连接凭据字段；Profile 只保留公开启动设置", async () => {
  const c = configured();
  assert.throws(
    () => validateConfig({ ...c, apiKey: "fictional-test-placeholder" }),
    /字段无效/,
  );
  const publicProfile = normalizeProfiles([
    { ...profiles[0], env: { PRIVATE: "fictional-test-placeholder" } },
  ])[0];
  assert.equal(Object.hasOwn(publicProfile, "env"), false);
  assert.equal(publicProfile.thinkingOptionId, "high");
  assert.throws(() => normalizeProfiles([null]), /缺少/);
  await assert.rejects(readJson("/nonexistent/.env.json"), /禁止访问/);
});

test("setup 先展示不写配置，保存后另一个新进程按主控自动读取", async (t) => {
  const f = await fixture(t);
  const args = ["setup", "--config", f.config, "--profiles", f.inventory];
  const preview = await main(args);
  assert.equal(preview.status, "NEEDS_SELECTION");
  assert.equal(await readConfig(f.config), null);
  assert.equal(
    (await main([...args, "--input", f.input, "--expected-revision", "0"]))
      .config.revision,
    1,
  );
  const cli = path.resolve("skills/paseo-team/scripts/team.mjs");
  const { stdout } = await promisify(execFile)(process.execPath, [
    cli,
    "resolve",
    "--config",
    f.config,
    "--profiles",
    f.inventory,
    "--lead",
    "codex",
  ]);
  assert.equal(JSON.parse(stdout).team.developer.alias, "deepseek");
  const status = await main([
    "status",
    "--config",
    f.config,
    "--lead",
    "claude",
  ]);
  assert.equal(status.effectiveDefaults.developer, "codex");
});

test("旧 revision 或并发 setup 不覆盖别的会话配置，失败释放锁", async (t) => {
  const { config } = await fixture(t);
  await updateConfig(config, 0, () => configured());
  await assert.rejects(
    updateConfig(config, 0, () => configured()),
    /已被其他会话更新/,
  );
  const results = await Promise.allSettled([
    updateConfig(config, 1, (c) => ({
      ...c,
      presets: { ...c.presets, a: { dev: "codex" } },
    })),
    updateConfig(config, 1, (c) => ({
      ...c,
      presets: { ...c.presets, b: { dev: "deepseek" } },
    })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await readConfig(config)).revision, 2);
  await assert.rejects(stat(`${config}.lock`), { code: "ENOENT" });
});

test("任务快照不随全局配置及 Profile 改动漂移，不能覆盖", async (t) => {
  const f = await fixture(t);
  const c = configured();
  const team = resolveTeam(c, profiles, { lead: "claude", review: "2" });
  const snapshot = path.join(f.dir, "team.json");
  await freezeTeam(snapshot, team, { taskId: "task-1", repo: f.dir });
  await updateConfig(f.config, 0, () => ({
    ...c,
    byLead: { claude: { developer: "deepseek" } },
  }));
  const changed = profiles.map((p) => ({ ...p, model: "changed-model" }));
  assert.equal(
    resolveTeam(await readConfig(f.config), changed, { lead: "claude" })
      .developer.model,
    "changed-model",
  );
  const frozen = (await main(["status", "--snapshot", snapshot])).snapshot;
  assert.equal(frozen.developer.model, "test-codex");
  assert.deepEqual(frozen.developer.featureValues, { web: true });
  await assert.rejects(
    freezeTeam(snapshot, team, { taskId: "task-1", repo: f.dir }),
    /已经冻结/,
  );
  const invalid = path.join(f.dir, "invalid.json");
  await writeFile(invalid, "{}");
  await assert.rejects(main(["status", "--snapshot", invalid]), /快照无效/);
  const unspecified = structuredClone(team);
  delete unspecified.developer.model;
  await assert.rejects(
    freezeTeam(path.join(f.dir, "unspecified.json"), unspecified, {
      taskId: "task-2",
      repo: f.dir,
    }),
    /实际 model/,
  );
});

test("CLI 保存常用组合且不启动模型，参数拼错或重复立即失败", async (t) => {
  const f = await fixture(t);
  await updateConfig(f.config, 0, () => configured());
  const saved = await main([
    "preset",
    "save",
    "daily",
    "--config",
    f.config,
    "--expected-revision",
    "1",
    "--dev",
    "codex",
    "--review",
    "2",
  ]);
  assert.equal(saved.revision, 2);
  assert.equal((await readConfig(f.config)).presets.daily.review, "2");
  await assert.rejects(
    main(["resolve", "--lead", "codex", "--lead", "claude"]),
    /重复/,
  );
  await assert.rejects(main(["resolve", "--developer", "codex"]));
  await assert.rejects(
    main(["status", "--snapshot", f.input, "--config", f.config]),
    /不混用/,
  );
  assert.equal(
    (await readFile(f.config, "utf8")).includes("fictional-test-placeholder"),
    false,
  );
});
