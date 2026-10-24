# Paseo Team

让当前 Claude、Codex 等对话负责方案和调度，一个开发者负责实现与验证。**默认简单合作，不自动审查；需要时用自然语言指定评审人数、阶段和成员。**

这是用于 Claude Code / Codex + Paseo 的 Skill，复用 Paseo Profiles 和官方编排能力。一次设置可同时保存不同主控的默认团队，新开对话或切换主控后不用重新选人。

```text
当前主控 → 读取本次团队
    ↓
可选：方案成员独立分析 → 交换实质分歧 → 确定方案
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

下面使用 Claude 入口；在 Codex 中将 `/paseo-team` 换成 `$paseo-team`。这些是对话中的 Skill 调用，不是在 shell 里执行的命令。

```text
/paseo-team 给列表增加空状态提示，验证后返回
/paseo-team 完成这次修改，不需要评审
/paseo-team 请使用2个评审，给待办页面增加示例任务按钮
/paseo-team 完成这次重构，方案和最终代码都请3位评审做对抗性审查
/paseo-team 让 deepseek 开发，codex 和 claude 审查最终交付
```

| 你的说法                     | 执行范围                                       |
| ---------------------------- | ---------------------------------------------- |
| 不提审查，或明确“不要评审”   | 一个开发者实现与验证，主控核对回执后返回       |
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

## 对抗性审查如何工作

方案审查检验“问题和方案是否成立”；交付审查检验“原始任务是否完成，现有证据是否足以交付”。主控、开发者和其他 Reviewer 的判断都可以被质疑。

1. **独立首轮**：成员收到相同原始需求、实际路径和版本，各自检查，首轮不看其他成员意见。
2. **依据事实审查**：核对“用户要求 → 实际实现 → 真实调用路径 → 可观察行为 → 验证证据”，寻找漏做、反例和测试覆盖不足。
3. **处理实质分歧**：交换论据，必要时补验证；一致且证据充分时停止，不强行安排一人赞成、一人反对。
4. **批准同一版本**：有依据的阻断必须解决，不能用多数票忽略。修改后全体增量复审，不能把局部通过扩大为整体上线成功。

两人方案审查可复用官方 committee；三人及以上通过独立 advisor 会话组织。交付阶段每人各开新 Advisor。完整两人审查通常增加四个审查会话，仅交付两人审查增加两个。

Reviewer 保持只读，不运行会写文件的测试；动态证据交开发者或确有必要且已授权的独立验证会话。只读是角色约束，实际运行权限取决于 Profile，本 Skill 不自动建立权限沙盒。详见 [审查流程与提示词](skills/paseo-team/references/review.md)。

## Worktree、成本和交付

已有任务 worktree 直接复用，每个候选只有一个写入者，不要求手填 worktree setup scripts。默认交付候选后返回；用户授权本地合并后，才检查基线和工作树并快进 main。

[Git 工作流工具](skills/paseo-team/references/tools.md) 在共同 `main-publish.lock` 内复核状态，兼容旧 `herdr-main-publish.lock`，不依赖 Herdr。锁只协调遵守该协议的写入者，不代替验收或审批。不自动 push、部署、交易、归档或删除 worktree。

当前的效率约定：

- **交接只给角色所需材料**：保留业务需求和约束，去掉 Skill 调用前缀及已解析的编排参数，不要求成员重新加载整套团队规则。
- **证据集中索引**：小任务通常保留一份交付索引、测试日志和必要浏览器证据，直接引用可追溯的工具结果。
- **截图优先复用文件**：直接复制或导出已有截图，避免让模型反复搬运长 Base64。
- **报告简短、依据可查**：版本核对批量进行，正常通过时只写范围与关键依据，问题和未知按需展开；引用行号先核实。
- **保持独立判断**：各评审仍独立检查实际代码和原始证据，修复时复用本阶段会话，不擅自降低模型档位。

记录可取得的阶段耗时、token、缓存和修复轮次，比较同类任务的费用与返工；不预先承诺节省比例。不同模型的 token 占比不能代替费用占比，并行时长不能简单相加。进度汇报还受宿主和主控模型指令影响，重复的等待文字不等于 Skill 在轮询。

禁止读取、搜索内容、输出或上传 `.env` 和其他秘密。普通检查隔离凭据；明确授权的真实 API 验证只允许可信程序内部加载配置，不向 Agent 暴露凭据。

## 源码与验证

```text
skills/paseo-team/SKILL.md                    协作入口
skills/paseo-team/agents/openai.yaml          Codex 显式调用设置
skills/paseo-team/references/configuration.md 配置和命令语义
skills/paseo-team/references/review.md        多人审查及提示词
skills/paseo-team/references/tools.md         Git 工具用法
skills/paseo-team/scripts/team.mjs            配置、选人、保存冲突与任务快照
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

工具测试不加载凭据、不调用模型、不启动真实团队。自动检查不能替代多 Provider 的真实联动，也不能证明所有模型都遵守角色边界；已观察范围和待验证场景见 [验证说明](docs/verification.md)。

## 官方参考

以本机实际工具和 Profiles 为准：

- [Paseo 基础 Skill](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md)
- [方案委员会](https://github.com/getpaseo/paseo/blob/main/skills/paseo-committee/SKILL.md)
- [独立顾问](https://github.com/getpaseo/paseo/blob/main/skills/paseo-advisor/SKILL.md)
- [任务交接](https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md)
- [Agent Profiles](https://paseo.sh/docs/agent-profiles)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
