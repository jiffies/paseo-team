# Paseo Team

让当前对话（如 Claude/Opus）负责架构、方案和关键决策，一个开发者负责实现与验证。**默认简单合作，不自动审查；需要时用自然语言指定评审人数、阶段和成员。**

这是用于 Claude Code / Codex + Paseo 的 Skill，复用 Paseo Profiles 和官方编排能力。一次设置可同时保存不同主控的默认团队，新开对话或切换主控后不用重新选人。

Skill 只约定角色、选人和协作接口；具体如何分析问题、设计方案、实现或审查，由各成员自主判断。

```text
当前主控 → 读取本次团队
    ↓
可选：独立方案审查
    ↓
一个 Developer → 实现、必要验证、固定候选
    ↓
可选：全新 Reviewer 并行审查 → 修复或补证据 → 全体批准同一候选
    ↓
返回结果；已授权本地合并时再检查并快进 main
```

## 安装与接通工具

需要 Node.js 22+、Git、正在运行的 Paseo，以及 [Paseo 官方 Skills](https://paseo.sh/docs/skills)。本地合并额外使用 Linux/WSL 的 `flock`。使用 Skill 无需安装本仓库的开发依赖。

安装到 Claude Code 和 Codex：

```bash
npx skills add jiffies/paseo-team --skill paseo-team -a claude-code codex -g
```

从本地源码安装：

```bash
cd /path/to/paseo-team
npx skills add . --skill paseo-team -a claude-code codex -g
```

升级前将自定义版本备份到 Skills 目录外。安装整个 `skills/paseo-team/`，包含入口、references、scripts 和 agents 元数据，不能只复制 `SKILL.md`。新对话使用新版；正在运行的任务保留已确定的规则与成员。

### 在 Paseo 内使用

在 **Settings → 对应主机 → Agents → Enable Paseo tools** 开启工具，然后新建或重新加载 Agent。详见 [Paseo 编排说明](https://paseo.sh/docs/orchestration)。

### 在独立 Claude / Codex CLI 中使用

**安装 Skill 不会自动建立 MCP 连接。** 两个客户端需要各自接入 Paseo；后面的团队 setup 则可以共用一次配置。

下面以 Paseo 与 CLI 都运行在同一 WSL、监听端口为 `6768` 的本地连接为例。端口应替换为实际值，`6768` 不是本 Skill 规定的端口。在普通终端执行你使用的客户端对应命令：

```bash
# Codex
codex mcp add paseo --url http://127.0.0.1:6768/mcp/agents

# Claude Code：用户级配置，跨项目可用
claude mcp add --transport http --scope user paseo http://127.0.0.1:6768/mcp/agents
```

上述示例不包含认证参数；启用认证的 Paseo 主机还需按客户端支持的方式配置认证。连接后重新打开对话，让主控调用 `list_profiles` 检查是否可用。它是 **MCP 工具**，不是 `paseo profiles` 子命令。详见 [MCP 参考](https://paseo.sh/docs/mcp)。

## setup 一次，同时设置不同主控

先在 Paseo 中准备至少一个开发者 Profile；需要审查时再准备审查 Profiles。Profile 保存模型、思考等级、模式等运行设置，本 Skill 不要求主控必须使用 Architect Profile。

任选一个入口执行，不需要分别设置两遍：

```text
# 在 Claude 对话中
/paseo-team setup

# 或在 Codex 对话中
$paseo-team setup
```

可以补充：“一次配置好 Claude 和 Codex 两种主控的默认组合。”主控会读取真实 Profiles，一次列出成员绑定和默认组合供你选择，保存到：

```text
~/.config/paseo-team/config.json
```

配置属于**同一主机、同一用户**，当前版本没有项目级配置。Claude 和 Codex 在同一 WSL 用户下共用该文件，分别读取自己的默认组合。例如：

| 当前主控 | 默认开发者 | 请求两人审查时   | 请求三人审查时            |
| -------- | ---------- | ---------------- | ------------------------- |
| Claude   | codex      | claude + codex   | claude + codex + deepseek |
| Codex    | codex      | codex + deepseek | 暂不设置                  |

这些是示例别名，需绑定到实际可用的 Profiles。未设置的组合会提示补齐，不会自动加入 Claude、替换模型或减少人数。**保存审查名单不会自动开启审查。** setup 也不会启动开发或评审任务。

新对话按当前主控身份读取默认值；同一 CLI 内换模型仍使用同一主控键，需要区分时可配置额外键。Windows 本机、其他主机或其他用户的 home 不会自动共享这份 WSL 配置。

查看当前配置：

```text
/paseo-team status
```

## 日常使用：直接说人话

下面使用 Claude 入口；在 Codex 中将 `/paseo-team` 换成 `$paseo-team`。这些是对话中的 Skill 调用，不是在 shell 里执行的命令。同一任务后续直接说“继续”“修复刚才的问题”即可，无需反复加 Skill 前缀；沿用已冻结的任务与成员。新的无关任务宜新开对话，未结束的任务先保留恢复入口。

```text
/paseo-team 给列表增加空状态提示，验证后返回
/paseo-team 完成这次修改，不需要评审
/paseo-team 请使用2个评审，给待办页面增加示例任务按钮
/paseo-team 完成这次重构，方案和最终代码都请3位评审做对抗性审查
/paseo-team 让 deepseek 开发，codex 和 claude 审查最终交付
```

| 你的说法                     | 执行范围                                       |
| ---------------------------- | ---------------------------------------------- |
| 不提审查，或明确“不要评审”   | 主控负责方案，单开发者实现与验证，主控综合交付 |
| “双审核”“两个评审”“审查一下” | 默认仅做两人交付审查，从当前主控的两人组取成员 |
| “方案和最终代码都由三人审查” | 方案与交付各三人，两个阶段使用不同新会话       |
| “仅审查方案”                 | 只增加方案审查，不自动追加交付审查             |
| 明确点名开发者、评审者       | 使用已绑定的成员及相应角色 Profile             |

任务复杂或风险较高时，主控可以建议增加审查，但收到明确同意前仍走简单模式。主控不计入评审人数；没有可用成员时会报告缺口，不擅自凑人。

## 一个别名可以分别绑定开发和审查

`codex`、`claude`、`deepseek` 是团队成员别名，具体运行设置来自你在 Paseo 中保存的 Profile。别名可以按角色绑定不同 Profile：

| 别名与角色                                 | 示例 Profile              | 什么时候使用       |
| ------------------------------------------ | ------------------------- | ------------------ |
| `codex.developer`                          | Developer                 | 实现、测试、修复   |
| `codex.reviewer`                           | QA                        | 方案或交付审查     |
| `claude.reviewer`                          | Architect                 | 独立审查           |
| `deepseek.developer` / `deepseek.reviewer` | 已配置的 DeepSeek Profile | 按本次角色分别启动 |

因此，`codex → Developer / QA` 表示**按角色分别绑定**。开发会取 `developer`，审查会取 `reviewer`；某个角色缺失会报错，不自动用另一个角色顶替。

开发始终只有一个会话。即使主控、开发者和评审使用同一模型，也分别新建成员会话；同一 Profile 可以复用，方案会话不能直接承担最终验收。

增加 DeepSeek 或其他模型时：

1. 在 Paseo 中配置可用的 Provider、模型和 Profile。
2. 执行 setup，添加别名，绑定开发、审查或两种角色。
3. 加入相应主控的默认组合，或在任务中直接点名。

**无需修改 Skill 源码。** 别名不会自动安装 Provider，也不能让 Paseo 支持原本不可用的模型。

## 精确参数与常用组合

自然语言之外，也可以使用明确参数：

| 选项                                          | 意义                                     |
| --------------------------------------------- | ---------------------------------------- |
| `--dev deepseek`                              | 本次开发者，不修改默认值                 |
| `--review 2`                                  | 仅交付阶段，由当前主控默认两人组审查     |
| `--plan 2`                                    | 仅方案阶段，由当前主控默认两人组审查     |
| `--audit 3`                                   | 方案和交付都审，每阶段三位独立成员       |
| `--audit codex,deepseek`                      | 两个阶段都用指定名单                     |
| `--plan codex,deepseek --review claude,codex` | 两个阶段分别选人                         |
| `--audit 0`                                   | 本次不审查，包括覆盖 preset 中的审查选择 |

`--audit` 不能与 `--plan` / `--review` 混用。人数形式支持 0、2、3，更多成员可使用明确名单。

保存并使用常用组合：

```text
/paseo-team preset save no-claude --dev codex --audit codex,deepseek
/paseo-team --preset no-claude 完成本次修改
```

保存组合只更新配置；使用含审查选项的组合才会启用审查。选择优先级为：**本次参数 → preset → 当前主控默认 → 通用默认**。明确指定审查阶段会替换 preset 的整个审查范围，例如 `--preset no-claude --review 2` 只做交付审查。

任务启动时冻结成员和 Profile 设置，其他对话执行 setup 或修改 Profile 不会改变正在运行的任务。详见 [配置与选人](skills/paseo-team/references/configuration.md)。

## 独立审查

方案成员评估架构与方案，交付 Reviewer 评估实现是否满足用户目标。成员自主决定审查方法；主控协调结论，Developer 负责修复。对抗性审查允许质疑主控、开发者和其他成员的判断，不强制分配正反观点或安排固定争论轮次。

只执行用户选定的阶段和人数。两位方案成员可用官方 committee，三人及以上用独立 advisor；交付阶段每人新开 Advisor。方案和交付使用不同会话，同阶段复审复用原成员。

Reviewer 只读；需要动态验证时交 Developer。全部所选成员认可同一版本后，该阶段才通过；版本实质变化后由原成员确认。审查不授予合并或发布权限。详见 [审查协作](skills/paseo-team/references/review.md)。

## Worktree、成本和交付

已有任务 worktree 直接复用，每个候选只有一个写入者，不要求手填 worktree setup scripts。默认交付候选后返回；用户授权本地合并后，才检查基线和工作树并快进 main。

[Git 工作流工具](skills/paseo-team/references/tools.md) 在共同 `main-publish.lock` 内复核状态，兼容旧 `herdr-main-publish.lock`，不依赖 Herdr。锁只协调遵守该协议的写入者，不代替验收或审批。不自动 push、部署、交易、归档或删除 worktree。

当前的效率约定（保持已选模型和思考档位）：

- **减少重复劳动**：主控负责架构和方案，Developer 负责实现与验证；成员自行判断需要的探索和分析，不要求双方重复全面读取。
- **按操作加载说明**：派发任务才读 [执行接口](skills/paseo-team/references/execution.md)，setup/preset 管理才读配置说明。
- **续聊复用上下文**：同一任务沿用已加载规则、名单和成员会话，不重复调用 Skill 或重新选人。
- **检查输出先落盘**：[检查输出工具](skills/paseo-team/references/checks.md) 保存完整日志，成功简报，失败保留有界摘录与原退出码。回报简洁，必要原始材料仍可按需读取。

记录可取得的阶段耗时、token、缓存和修复轮次，比较同类任务的费用与返工；不预先承诺节省比例。不同模型的 token 占比不能代替费用占比，并行时长不能简单相加。进度汇报还受宿主和主控模型指令影响，重复的等待文字不等于 Skill 在轮询。

禁止读取、搜索内容、输出或上传 `.env` 和其他秘密。普通检查隔离凭据；明确授权的真实 API 验证只允许可信程序内部加载配置，不向 Agent 暴露凭据。

## 源码与验证

```text
skills/paseo-team/SKILL.md                    协作入口
skills/paseo-team/agents/openai.yaml          Codex 显式调用设置
skills/paseo-team/references/configuration.md setup、preset 与全局配置管理
skills/paseo-team/references/execution.md     团队解析、派发与交付接口
skills/paseo-team/references/checks.md        普通检查的简洁输出
skills/paseo-team/references/review.md        独立审查的角色与协作接口
skills/paseo-team/references/tools.md         Git 工具用法
skills/paseo-team/scripts/team.mjs            配置、选人、保存冲突与任务快照
skills/paseo-team/scripts/workflow.mjs        Git 状态检查及持锁快进
skills/paseo-team/scripts/run-check.mjs       完整日志落盘、保留退出码和有界摘录
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

工具测试不加载凭据、不调用模型、不启动真实团队。自动检查不能替代多 Provider 的真实联动，也不能证明所有模型都遵守角色边界；已观察范围和待验证场景见 [验证说明](docs/verification.md)。

## 官方参考

以本机实际工具和 Profiles 为准：

- [Paseo 基础 Skill](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md)
- [方案委员会](https://github.com/getpaseo/paseo/blob/main/skills/paseo-committee/SKILL.md)
- [独立顾问](https://github.com/getpaseo/paseo/blob/main/skills/paseo-advisor/SKILL.md)
- [任务交接](https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md)
- [Agent Profiles](https://paseo.sh/docs/agent-profiles)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
