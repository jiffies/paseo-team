# Paseo Team

当前对话负责方案和调度，一个开发者负责实现与验证。默认不审查，需要时再选两人、三人或具体名单。Claude 和 Codex 可以分别保存默认团队，换主控、新开对话后不用重新选人。

这是用于 **Claude Code / Codex + Paseo** 的 Skill。它复用 Paseo Profiles、handoff 和 advisor，不新增常驻协调器，不创建自定义 Provider。任务耗时、费用和返工都是优化目标。

```text
当前主控（Claude / Codex / …）
    ↓ 自动读取该主控的默认团队
可选：N 位方案成员独立判断 → 交换实质分歧 → 依据证据定方案
    ↓
一个 Developer → 实现、必要验证、固定候选 C
    ↓
可选：N 位全新 Reviewer → 独立检查 → 质疑论据 → 全体批准 C
    ↓
返回结果；已授权本地合并时再检查并快进 main
```

## 安装

先安装 [Paseo 官方 Skills](https://paseo.sh/docs/skills)，确保当前主控能使用 Paseo 工具。准备一个开发者 Profile；需要审查时再准备审查 Profiles。本 Skill 不要求主控必须使用 Architect Profile。

安装 Skill 不会自动连接 MCP。Paseo 内启动的 Agent 通过主机设置中的 Enable Paseo tools 获得工具；独立启动的 Claude/Codex CLI 需要分别连接对应主机的 Paseo MCP。`list_profiles` 是 MCP 工具，不是 `paseo profiles` 子命令；接入方式见 [官方工具说明](https://paseo.sh/docs/orchestration)。团队 setup 在同一主机/用户下做一次即可，不需要两种主控各做一次。

安装到 Claude Code 和 Codex：

```bash
npx skills add jiffies/paseo-team --skill paseo-team -a claude-code codex -g
```

从本地源码安装：

```bash
cd /path/to/paseo-team
npx skills add . --skill paseo-team -a claude-code codex -g
```

升级前将自定义版本备份到 Skills 目录外。安装整个 `skills/paseo-team/`，包含入口、references、scripts 和 agents 元数据；不能只复制 SKILL.md。新任务重新读取新版，现有运行任务不强行换规则。

运行时需要 Node.js 22+、Git 和 Paseo；本地合并额外使用 Linux/WSL 的 `flock`。使用 Skill 无需安装本仓库开发依赖。Claude 的显式入口由 frontmatter 设置，Codex 由 `agents/openai.yaml` 禁止隐式调用。

## 一次设置，按主控记住默认团队

在 Claude 中输入：

```text
/paseo-team setup
```

在 Codex 中输入：

```text
$paseo-team setup
```

主控读取真实 Profiles，把需要选择的内容一次列给你，保存到这台主机、当前用户的 `~/.config/paseo-team/config.json`。同一 WSL 中的 Claude、Codex 共用该文件，各有自己的默认组合，例如：

| 当前主控 | 默认开发者 | 请求两人审查时   | 请求三人审查时            |
| -------- | ---------- | ---------------- | ------------------------- |
| Claude   | Codex      | Claude + Codex   | Claude + Codex + DeepSeek |
| Codex    | Codex      | Codex + DeepSeek | 暂不设置                  |

这是配置示例，要求相应模型已在 Paseo 中有可用 Profile。未设置的组合会提示补齐，不会自动加入 Claude、换模型或减人数。**保存审查名单不会让日常任务自动审查。**

默认按主控运行身份选择；同一 CLI 内换模型仍使用同一主控键。需要更细区分时可以配置额外键。Windows 本机与 WSL 的 home 各自独立，须在运行 Paseo 的同一环境执行工具。

## 日常使用

以下使用 Claude 入口；Codex 将 `/paseo-team` 换成 `$paseo-team`：

```text
/paseo-team 给列表增加空状态提示，验证后返回
/paseo-team --dev deepseek 完成本次修改
/paseo-team --review 2 检查并修复订单恢复逻辑
/paseo-team --audit 3 重构存储层
/paseo-team --plan codex,deepseek --review claude,codex 完成本次任务
/paseo-team status
```

| 选项                     | 意义                                     |
| ------------------------ | ---------------------------------------- |
| 不加审查选项             | 单开发者实现、验证，主控核对回执后返回   |
| `--review 2`             | 仅交付阶段，由当前主控默认的两位成员审查 |
| `--plan 2`               | 仅方案阶段                               |
| `--audit 3`              | 方案和交付都审，每阶段三位独立成员       |
| `--audit codex,deepseek` | 两个阶段都用指定名单                     |
| `--audit 0`              | 本次不审查，包括覆盖 preset 的审查选择   |
| `--dev deepseek`         | 本次开发者；不修改默认值                 |

`--audit` 不能与 `--plan/--review` 混用。自然语言也可以，主控按人数、范围和成员要求解析。任务复杂或高风险时可以建议审查，得到明确同意前仍走简单模式。

保存常用组合：

```text
/paseo-team preset save no-claude --dev codex --audit codex,deepseek
/paseo-team --preset no-claude 完成本次修改
```

本次参数覆盖 preset，preset 覆盖主控默认，主控默认覆盖通用默认。明确指定审查阶段时替换 preset 的整个审查范围。任务启动时冻结名单与 Profile 设置，其他对话修改全局默认不会影响正在执行的任务。详见 [配置与选人](skills/paseo-team/references/configuration.md)。

## 增加模型或调整成员

先在 Paseo 配好可用的模型和 Profile，再执行 setup，给它一个别名并绑定 developer、reviewer 或两种角色，最后加入需要的组合。**不用改 Skill 源码。** 别名只是选人入口，不能让 Paseo 自动支持原本不支持的 Provider。

开发始终由一个会话负责；即便主控、开发者、审查者都使用 Codex，也必须是不同会话。方案与最终交付审查不能复用会话。因此完整两人审查通常会增加四个审查会话，仅交付两人审查则只增加两个。

## 对抗性审查做什么

审查目标是检验“方案成立吗”“原始任务真的完成了吗”，允许推翻主控、实现者和其他 Reviewer 的判断。每位成员先独立检查原始需求、实际源码、调用路径与验证证据，再交换实质分歧；不机械安排一人支持、一人反对。

有证据的阻断不能被多数票消除，证据也可以推翻 Reviewer 的错误质疑。可选增强不冒充验收要求，局部阶段批准不冒充整体上线成功。所有选定成员批准同一版本才放行；修改后全体增量复审。详见 [审查流程与提示词](skills/paseo-team/references/review.md)。

两人方案审查可使用官方 committee；三人及以上按独立 advisor 会话组织同样的讨论步骤，不假称官方 committee 原生支持 N 人。只读角色不运行会写文件的测试，动态证据交开发者或明确需要的独立验证会话。

## Worktree、成本与交付边界

已有任务 worktree 直接复用，不重复创建，不要求手填 setup scripts。每个任务独立 worktree，每个候选一个写入者。默认交付候选后返回，用户已授权时才合入本地 main；不自动 push、部署、交易或清理工作树。

[Git 工作流工具](skills/paseo-team/references/tools.md) 批量检查基线和候选，授权合并时在共同 `main-publish.lock` 内只做快进；兼容既有 `herdr-main-publish.lock`，不依赖 Herdr。锁只保护遵守该协议的写入者，不能代替验收或审批。

交接只保留成员本角色需要的业务目标、边界和证据入口，不转发 Skill 调用前缀或要求成员重新加载整套编排规则。小任务通常保留一份交付索引、测试日志和必要浏览器记录/截图；直接引用可追溯的工具结果，截图优先复制或导出已有文件。版本核对批量进行，报告只展开差异、阻断和关键依据，各评审仍独立检查实际代码和验证证据。

按需读文件，减少重复验证，修复时复用该阶段 Reviewer。沿用所选 Profile，不擅自降档。记录可取得的阶段耗时、token、缓存和修复轮次；模型与计费方式不同，token 占比不能代替费用占比，并行时长不能简单相加。进度汇报还受宿主和主控模型指令影响，不能仅凭重复的等待文字断定 Skill 在轮询。

禁止读取、搜索内容、输出或上传 `.env` 和其他秘密。普通检查隔离凭据；明确授权的真实 API 验证仅允许可信程序内部加载配置，不向 Agent 暴露凭据。

## 源码与验证

```text
skills/paseo-team/SKILL.md                    协作入口
skills/paseo-team/agents/openai.yaml          Codex 显式调用设置
skills/paseo-team/references/configuration.md 配置和命令语义
skills/paseo-team/references/review.md        N 人审查及提示词
skills/paseo-team/references/tools.md         Git 工具用法
skills/paseo-team/scripts/team.mjs            配置、选人、版本冲突与任务快照
skills/paseo-team/scripts/workflow.mjs        Git 状态检查及持锁快进
tests/                                      配置及临时 Git 仓库测试
docs/verification.md                        验证范围与限制
```

开发检查：

```bash
npm ci
npm run format
npm run check
npm run ci
```

工具测试不加载凭据，不调用模型，不启动真实团队。自动检查通过不代表真实多 Provider 联动通过，详见 [验证说明](docs/verification.md)。

本项目由用户提供的 v2 包演进而来；v3 改为默认简单合作，v4 增加按主控的持久默认、单开发者选择、可配置审查人数和冻结名单。

## 官方参考

以本机实际工具和 Profiles 为准：

- [Paseo 基础 Skill](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md)
- [方案委员会](https://github.com/getpaseo/paseo/blob/main/skills/paseo-committee/SKILL.md)
- [独立顾问](https://github.com/getpaseo/paseo/blob/main/skills/paseo-advisor/SKILL.md)
- [任务交接](https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md)
- [Agent Profiles](https://paseo.sh/docs/agent-profiles)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
