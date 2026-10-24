import { constants } from "node:fs";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

const own = (object, key) => Object.hasOwn(object, key);
const fail = (message) => {
  throw new Error(message);
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const aliasPattern = /^[a-z][a-z0-9-]{0,63}$/;
const reserved = new Set(["constructor", "prototype", "__proto__"]);
function alias(value) {
  return (
    typeof value === "string" &&
    aliasPattern.test(value) &&
    !reserved.has(value)
  );
}
function keys(value, allowed, label) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    fail(`${label} 字段无效；团队配置不保存凭据或 Provider 连接参数。`);
  }
}
function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeProfiles(input) {
  const profiles = Array.isArray(input) ? input : input?.profiles;
  if (!Array.isArray(profiles))
    fail("需要 list_profiles 返回的 Profiles 数组。");
  const ids = new Set();
  return profiles.map((source) => {
    if (
      !object(source) ||
      !nonempty(source.id) ||
      !nonempty(source.name) ||
      !nonempty(source.provider) ||
      ids.has(source.id)
    ) {
      fail("Profile 缺少 id/name/provider，或 ID 重复。");
    }
    ids.add(source.id);
    const result = {
      id: source.id,
      name: source.name,
      provider: source.provider,
    };
    for (const key of ["model", "modeId", "thinkingOptionId", "notes"]) {
      if (source[key] !== undefined && source[key] !== null) {
        if (typeof source[key] !== "string") fail("Profile 文本字段类型错误。");
        result[key] = source[key];
      }
    }
    if (source.featureValues != null) {
      if (
        !object(source.featureValues) ||
        Object.values(source.featureValues).some(
          (v) => !["string", "boolean", "number"].includes(typeof v),
        )
      ) {
        fail("Profile featureValues 必须是标量映射。");
      }
      result.featureValues = structuredClone(source.featureValues);
    }
    return result;
  });
}

function validateSelection(value, config) {
  if (value === "0" || value === "2" || value === "3") return;
  if (typeof value !== "string")
    fail("审查选择必须为 0、2、3 或逗号分隔的成员别名。");
  const members = value.split(",");
  if (
    members.length < 2 ||
    new Set(members).size !== members.length ||
    members.some(
      (name) => !own(config.aliases, name) || !config.aliases[name].reviewer,
    )
  ) {
    fail("审查名单至少需要两个不同成员，且每个成员必须配置 reviewer Profile。");
  }
}

function validateOptions(options, config) {
  keys(options, ["dev", "audit", "plan", "review"], "任务选项");
  if (
    own(options, "dev") &&
    (!own(config.aliases, options.dev) ||
      !config.aliases[options.dev].developer)
  ) {
    fail("开发者别名未配置 developer Profile。");
  }
  if (own(options, "audit") && (own(options, "plan") || own(options, "review")))
    fail("--audit 不能与 --plan/--review 同时使用。");
  for (const field of ["audit", "plan", "review"]) {
    if (own(options, field)) validateSelection(options[field], config);
  }
}

export function validateConfig(config) {
  keys(
    config,
    ["schemaVersion", "revision", "aliases", "defaults", "byLead", "presets"],
    "配置",
  );
  if (
    config.schemaVersion !== 1 ||
    !Number.isSafeInteger(config.revision) ||
    config.revision < 0
  )
    fail("配置 schemaVersion/revision 无效。");
  for (const name of ["aliases", "byLead", "presets"]) {
    if (
      !object(config[name]) ||
      Object.keys(config[name]).some((key) => !alias(key))
    )
      fail(`${name} 必须使用有效的成员/主控/组合别名。`);
  }
  for (const roles of Object.values(config.aliases)) {
    keys(roles, ["developer", "reviewer"], "成员");
    if (
      !Object.keys(roles).length ||
      Object.values(roles).some((id) => !nonempty(id))
    )
      fail("成员须至少绑定一个真实 Profile ID。");
  }
  for (const defaults of [config.defaults, ...Object.values(config.byLead)]) {
    keys(defaults, ["developer", "reviewTeams"], "默认组合");
    if (
      own(defaults, "developer") &&
      defaults.developer !== null &&
      (!own(config.aliases, defaults.developer) ||
        !config.aliases[defaults.developer].developer)
    )
      fail("默认开发者不存在。");
    if (defaults.reviewTeams !== undefined) {
      keys(defaults.reviewTeams, ["2", "3"], "人数组合");
      for (const [count, team] of Object.entries(defaults.reviewTeams)) {
        if (team === null) continue;
        if (!Array.isArray(team) || team.length !== Number(count))
          fail("人数组合与实际成员数不符。");
        validateSelection(team.join(","), config);
      }
    }
  }
  for (const preset of Object.values(config.presets))
    validateOptions(preset, config);
  return config;
}

export function createDraft(input) {
  const profiles = normalizeProfiles(input);
  const find = (name, provider) => {
    const matches = profiles.filter(
      (p) => p.name === name && p.provider === provider,
    );
    return matches.length === 1 ? matches[0].id : undefined;
  };
  const developer = find("Developer", "codex");
  const qa = find("QA", "codex");
  const architect = find("Architect", "claude");
  const aliases = {};
  if (developer || qa)
    aliases.codex = {
      ...(developer && { developer }),
      ...(qa && { reviewer: qa }),
    };
  if (architect) aliases.claude = { reviewer: architect };
  const defaults = {
    developer: developer ? "codex" : null,
    reviewTeams: { 2: qa && architect ? ["claude", "codex"] : null, 3: null },
  };
  return {
    schemaVersion: 1,
    revision: 0,
    aliases,
    defaults,
    byLead: {
      claude: structuredClone(defaults),
      // An explicit null prevents a Codex lead from falling back to Claude reviewers.
      codex: {
        developer: developer ? "codex" : null,
        reviewTeams: { 2: null, 3: null },
      },
    },
    presets: {},
  };
}

function effectiveDefaults(config, lead) {
  if (!alias(lead))
    fail(
      "请根据当前主会话的真实 Provider/模型身份提供 --lead，不能用开发者身份代替。",
    );
  const local = config.byLead[lead] ?? {};
  return {
    developer: own(local, "developer")
      ? local.developer
      : config.defaults.developer,
    reviewTeams: { ...config.defaults.reviewTeams, ...local.reviewTeams },
  };
}

function launchProfile(config, profiles, name, role) {
  const id = config.aliases[name]?.[role];
  const profile = profiles.find((p) => p.id === id);
  if (!profile) fail(`成员 ${name} 的 ${role} Profile 不可用；不会静默替换。`);
  const { notes, ...settings } = profile;
  return { alias: name, ...settings };
}

export function resolveTeam(config, input, { lead, preset, ...overrides }) {
  validateConfig(config);
  validateOptions(overrides, config);
  const profiles = normalizeProfiles(input);
  const defaults = effectiveDefaults(config, lead);
  if (preset !== undefined && !own(config.presets, preset))
    fail("指定的常用组合不存在。");
  const saved = preset === undefined ? {} : config.presets[preset];
  const explicitReview = ["audit", "plan", "review"].some((key) =>
    own(overrides, key),
  );
  const selection = explicitReview ? overrides : saved;
  const developer = overrides.dev ?? saved.dev ?? defaults.developer;
  if (!developer) fail("当前主控没有默认开发者；请 setup 或本次指定 --dev。");
  function reviewers(value = "0") {
    if (value === "0") return [];
    const names =
      value === "2" || value === "3"
        ? defaults.reviewTeams[value]
        : value.split(",");
    if (!names)
      fail(`当前主控尚未设置 ${value} 人组合；请指定成员或运行 setup。`);
    const team = names.map((name) =>
      launchProfile(config, profiles, name, "reviewer"),
    );
    if (new Set(team.map((p) => p.id)).size !== team.length)
      fail("同一 Profile 的多个别名不能充当多个审查成员。");
    return team;
  }
  return {
    schemaVersion: 1,
    configRevision: config.revision,
    lead,
    ...(preset !== undefined && { preset }),
    developer: launchProfile(config, profiles, developer, "developer"),
    planReviewers: reviewers(selection.audit ?? selection.plan),
    deliveryReviewers: reviewers(selection.audit ?? selection.review),
    singleWriter: true,
    freshReviewSessions: true,
  };
}

export function checkBindings(config, input) {
  validateConfig(config);
  const profiles = normalizeProfiles(input);
  for (const [name, roles] of Object.entries(config.aliases)) {
    for (const role of Object.keys(roles))
      launchProfile(config, profiles, name, role);
  }
  // Validate configured groups, even when they are not selected for today's task.
  for (const defaults of [config.defaults, ...Object.values(config.byLead)]) {
    for (const names of Object.values(defaults.reviewTeams ?? {})) {
      if (
        names &&
        new Set(names.map((name) => config.aliases[name].reviewer)).size !==
          names.length
      )
        fail("人数组合包含重复的审查 Profile。");
    }
  }
  for (const preset of Object.values(config.presets)) {
    for (const field of ["audit", "plan", "review"]) {
      const value = preset[field];
      if (value?.includes(",")) {
        const names = value.split(",");
        if (
          new Set(names.map((name) => config.aliases[name].reviewer)).size !==
          names.length
        )
          fail("常用组合包含重复的审查 Profile。");
      }
    }
  }
  return config;
}

export function defaultConfigPath() {
  // Deliberately no environment-variable discovery or native Paseo config reads.
  return path.join(os.homedir(), ".config", "paseo-team", "config.json");
}

function publicPath(file) {
  const absolute = path.resolve(file);
  const parts = absolute.replaceAll("\\", "/").split("/");
  if (
    !absolute.endsWith(".json") ||
    parts.some(
      (part) =>
        /^\.env(?:\.|$)/i.test(part) ||
        [".ssh", ".aws", ".gnupg", ".paseo"].includes(part) ||
        /^(?:auth|credentials?|secrets?)\./i.test(part),
    )
  )
    fail("仅接受团队配置、Profile 清单或任务快照 JSON，禁止访问凭据路径。");
  return absolute;
}

export async function readJson(file) {
  const absolute = publicPath(file);
  publicPath(await realpath(absolute));
  const handle = await open(
    absolute,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2_000_000)
      fail("JSON 必须为不超过 2 MB 的普通文件。");
    let value;
    try {
      value = JSON.parse(await handle.readFile("utf8"));
    } catch {
      fail("JSON 无法解析；未回显文件内容。");
    }
    return value;
  } finally {
    await handle.close();
  }
}

export async function readConfig(file) {
  try {
    return validateConfig(await readJson(file));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function updateConfig(file, expectedRevision, change) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    fail("保存需要 status/setup 返回的 expected-revision。");
  const absolute = publicPath(file);
  await mkdir(path.dirname(absolute), { recursive: true });
  const lockPath = `${absolute}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      fail("配置正在被另一个 setup 修改；不会覆盖或删除锁，请稍后重读配置。");
    throw error;
  }
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  try {
    const current = await readConfig(absolute);
    if ((current?.revision ?? 0) !== expectedRevision)
      fail("配置已被其他会话更新，请重新读取并合并选择。");
    const next = validateConfig({
      ...change(current),
      revision: expectedRevision + 1,
    });
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, absolute);
    return next;
  } finally {
    try {
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    } finally {
      try {
        await lock.close();
      } finally {
        await unlink(lockPath);
      }
    }
  }
}

export function validateSnapshot(snapshot) {
  if (
    !object(snapshot) ||
    snapshot.schemaVersion !== 1 ||
    !Number.isSafeInteger(snapshot.configRevision) ||
    snapshot.configRevision < 0 ||
    !alias(snapshot.lead) ||
    !nonempty(snapshot.taskId) ||
    !nonempty(snapshot.repo) ||
    !nonempty(snapshot.createdAt) ||
    Number.isNaN(Date.parse(snapshot.createdAt)) ||
    snapshot.singleWriter !== true ||
    snapshot.freshReviewSessions !== true
  )
    fail("任务快照无效，不能作为已冻结名单使用。");
  for (const members of [
    [snapshot.developer],
    snapshot.planReviewers,
    snapshot.deliveryReviewers,
  ]) {
    if (!Array.isArray(members) || members.some((p) => !alias(p?.alias)))
      fail("任务快照成员无效。");
    normalizeProfiles(members);
  }
  for (const members of [snapshot.planReviewers, snapshot.deliveryReviewers]) {
    if (
      members.length === 1 ||
      new Set(members.map((p) => p.alias)).size !== members.length
    )
      fail("任务快照审查名单无效。");
  }
  return snapshot;
}

export async function freezeTeam(file, team, { taskId, repo }) {
  if (!nonempty(taskId) || !nonempty(repo))
    fail("保存任务名单需要 task-id 和 repo。");
  const snapshot = validateSnapshot({
    ...team,
    taskId,
    repo: path.resolve(repo),
    createdAt: new Date().toISOString(),
  });
  if (
    [
      snapshot.developer,
      ...snapshot.planReviewers,
      ...snapshot.deliveryReviewers,
    ].some((p) => !nonempty(p.model))
  )
    fail("冻结前需通过官方能力确认实际 model，不能冻结可漂移的默认模型。");
  const absolute = publicPath(file);
  await mkdir(path.dirname(absolute), { recursive: true });
  let handle;
  try {
    handle = await open(absolute, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      fail(
        "任务名单已经冻结；使用 status --snapshot 读取，不能随默认配置重选成员。",
      );
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return snapshot;
}

const optionNames = [
  "config",
  "profiles",
  "input",
  "expected-revision",
  "lead",
  "dev",
  "audit",
  "plan",
  "review",
  "preset",
  "snapshot",
  "task-id",
  "repo",
];
const help = {
  commands: [
    "setup --profiles inventory.json [--input choices.json --expected-revision N]",
    "status [--lead codex] [--profiles inventory.json]",
    "status --snapshot team.json",
    "preset save NAME --expected-revision N [--dev ALIAS] [--audit 2|3|LIST | --plan LIST --review LIST]",
    "resolve --lead codex --profiles inventory.json [--dev ALIAS] [--preset NAME] [--audit 0|2|3|LIST | --plan LIST --review LIST] [--snapshot team.json --task-id ID --repo PATH]",
  ],
  note: "本工具只管理配置与名单，不启动 Agent、调用模型、授权部署或修改 Provider。Skill 的 setup 会话负责一次收集选择；未指定审查始终简单模式。",
};

export async function main(argv) {
  // Repeated options are rejected rather than silently changing membership.
  const seen = new Set();
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const key = arg.split("=", 1)[0];
      if (seen.has(key)) fail("参数重复，请明确唯一的成员选择。");
      seen.add(key);
    }
  }
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: Object.fromEntries([
      ...optionNames.map((name) => [name, { type: "string" }]),
      ["help", { type: "boolean" }],
    ]),
  });
  if (values.help || !positionals.length) return help;
  const [command, action, name] = positionals;
  const accepted = {
    setup: ["config", "profiles", "input", "expected-revision"],
    status: ["config", "profiles", "lead", "snapshot"],
    preset: ["config", "expected-revision", "dev", "audit", "plan", "review"],
    resolve: [
      "config",
      "profiles",
      "lead",
      "dev",
      "audit",
      "plan",
      "review",
      "preset",
      "snapshot",
      "task-id",
      "repo",
    ],
  };
  if (
    !own(accepted, command) ||
    Object.keys(values).some((key) => !accepted[command].includes(key)) ||
    (command !== "preset" && positionals.length !== 1) ||
    (command === "preset" &&
      (action !== "save" || !alias(name) || positionals.length !== 3))
  )
    fail("命令或参数不匹配，请运行 --help。");
  if (command === "status" && values.snapshot) {
    if (Object.keys(values).length !== 1)
      fail("读取任务快照时不混用全局配置选项。");
    return {
      status: "FROZEN",
      snapshot: validateSnapshot(await readJson(values.snapshot)),
    };
  }
  const file = values.config ?? defaultConfigPath();
  const config = await readConfig(file);
  const profiles = values.profiles
    ? normalizeProfiles(await readJson(values.profiles))
    : null;
  if (command === "status") {
    const missingBindings =
      config && profiles
        ? Object.entries(config.aliases).flatMap(([name, roles]) =>
            Object.entries(roles)
              .filter(([, id]) => !profiles.some((p) => p.id === id))
              .map(([role, profileId]) => ({ alias: name, role, profileId })),
          )
        : undefined;
    return {
      status: config ? "CONFIGURED" : "NOT_CONFIGURED",
      configPath: file,
      config,
      ...(config &&
        values.lead && {
          effectiveDefaults: effectiveDefaults(config, values.lead),
        }),
      ...(profiles && { profiles }),
      ...(missingBindings && { missingBindings }),
    };
  }
  if (command === "setup") {
    if (!profiles)
      fail("setup 需要从 Paseo list_profiles 取得的公开 Profile 清单。");
    if (!values.input) {
      if (values["expected-revision"] !== undefined)
        fail("只有保存 setup 才需要 expected-revision。");
      return {
        status: "NEEDS_SELECTION",
        configPath: file,
        expectedRevision: config?.revision ?? 0,
        draft: config ?? createDraft(profiles),
        profiles,
        questions: [
          "分别为 Claude、Codex 等主控选择一个默认开发者。",
          "为每种主控设置两人/三人审查组合；不用的组合留 null，不自动补人。",
          "选择成员别名及开发/审查 Profile，按需保存常用组合。默认不审查。",
        ],
      };
    }
    const choice = checkBindings(await readJson(values.input), profiles);
    const next = await updateConfig(
      file,
      Number(values["expected-revision"]),
      () => choice,
    );
    return { status: "SAVED", configPath: file, config: next };
  }
  if (command === "preset") {
    if (!config) fail("请先 setup，再保存常用组合。");
    const preset = Object.fromEntries(
      ["dev", "audit", "plan", "review"]
        .filter((key) => own(values, key))
        .map((key) => [key, values[key]]),
    );
    if (!Object.keys(preset).length)
      fail("保存组合时至少指定开发者或审查选项。");
    validateOptions(preset, config);
    const next = await updateConfig(
      file,
      Number(values["expected-revision"]),
      (current) => ({
        ...current,
        presets: { ...current.presets, [name]: preset },
      }),
    );
    return {
      status: "SAVED",
      configPath: file,
      revision: next.revision,
      preset: name,
      options: preset,
    };
  }
  if (!profiles || !values.lead)
    fail("resolve 需要 --profiles 和根据当前主会话确定的 --lead。");
  const options = Object.fromEntries(
    ["lead", "dev", "audit", "plan", "review", "preset"]
      .filter((key) => own(values, key))
      .map((key) => [key, values[key]]),
  );
  const team = resolveTeam(config ?? createDraft(profiles), profiles, options);
  if (!values.snapshot && (values["task-id"] || values.repo))
    fail("task-id/repo 必须与 snapshot 一起使用。");
  return {
    status: values.snapshot ? "FROZEN" : "RESOLVED",
    team: values.snapshot
      ? await freezeTeam(values.snapshot, team, {
          taskId: values["task-id"],
          repo: values.repo,
        })
      : team,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "ERROR",
        message: error.code
          ? `操作失败（${error.code}），未回显输入或文件内容。`
          : error.message,
      }),
    );
    process.exitCode = 1;
  }
}
