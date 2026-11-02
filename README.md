# Paseo Team

在 Paseo 中，让你选的主控（例如 Claude Opus）负责根因、架构和关键决策，配置的 Developer（例如 Codex）负责写代码、测试和部署。复杂任务会自动加入方案与代码的对抗性审查。

```text
主控：根因分析 → 方案与验收
    ↓ 复杂任务：方案审查（两人背靠背）
Developer：占用 worktree → 实现 → 验证 → 候选
    ↓ 复杂任务：代码审查（新会话）
主控验收 → 获授权后由 Developer 合并、push、部署
```

派发和审查都使用 [Paseo 官方 Skills](https://paseo.sh/docs/skills)（`paseo-handoff`、`paseo-advisor`、`paseo-committee`）。本 Skill 只补充角色配置、审查触发与裁决、worktree 占用、子 agent 安全约定和合并工具。

## 使用流程

只有 3 个命令（Codex 中把 `/` 换成 `$`），其余都用自然语言：

| 命令                     | 作用                               |
| ------------------------ | ---------------------------------- |
| `/paseo-team setup`      | 管理组合，设置全局或项目的默认组合 |
| `/paseo-team status`     | 查看组合和当前项目实际生效的组合   |
| `/paseo-team <任务描述>` | 开始一个任务                       |

### 第一次使用

1. 按下文[安装](#安装)装好本 Skill，并在 Paseo 中开启 Paseo tools。
2. 在 Paseo 中准备 Profiles：一个给主控（例如 Claude Opus high），一个给开发（例如 Codex），一到两个给审查，审查者最好与开发用不同模型。
3. 新建任意 agent，执行 `/paseo-team setup`，按提示建一个组合并设为全局默认。某个项目需要不同成员时，在该项目目录下再说一句“这个项目默认用 X”。

### 每个任务

1. 在 Paseo 中，进入项目的 workspace，用主控 Profile 新建一个 agent。
2. 发送 `/paseo-team <任务描述>`。可以附加“需要审查”“不要审查”“用省钱组合”“让 pi-deepseek 开发”。
3. 主控自己分析根因，给出方案。复杂任务会说明已开启审查；方案审查僵持不下时，主控会把双方观点交给你决定。
4. Developer 在后台实现和验证，你不用盯。完成后主控验收并汇报：做了什么、检查结果、候选 commit、剩余问题。代码审查同样在这一步完成。
5. 需要修改时直接说“修复……”“继续”，不用再加命令前缀，沿用原来的成员和会话。
6. 满意后明确授权，例如“合并”“合并并 push”“部署”。Developer 执行后，主控汇报结果。没有授权时只交付候选，不合并。
7. 新的无关任务，新开一个主控 agent。

### 同时做多个任务

每个任务各开一个主控 agent，同一项目或不同项目都可以，互不干扰。所有 worktree 都被占用时，主控会列出占用情况，由你决定释放哪个或新建。

### 日常维护

- 模型换代：说“新建组合 X：……”“这个项目默认用 X”，或执行 `setup`。
- 查看配置：`/paseo-team status`。
- 升级 Skill：等进行中的任务结束后，重新执行安装命令；新开的主控使用新版。

## 安装

需要 Node.js 22+、Git、正在运行的 Paseo 和官方 Paseo Skills；合并另需 Linux/WSL 的 `flock`。

```bash
npx skills add jiffies/paseo-team --skill paseo-team -a claude-code codex -g
# 或从本地源码安装
npx skills add . --skill paseo-team -a claude-code codex -g
```

要安装整个 `skills/paseo-team/` 目录，不能只复制 `SKILL.md`。

在 Paseo 中使用时，打开 **Settings → 主机 → Agents → Enable Paseo tools**。在独立的 Claude Code / Codex CLI 中使用时，需要各自接入 Paseo MCP，端口以实际为准：

```bash
codex mcp add paseo --url http://127.0.0.1:6768/mcp/agents
claude mcp add --transport http --scope user paseo http://127.0.0.1:6768/mcp/agents
```

## 配置组合

一个**组合**包含三个角色，按 Paseo Profile 名称保存在 `~/.config/paseo-team/config.json`：

| 角色            | 作用                   |
| --------------- | ---------------------- |
| `developer`     | 实现、测试、修复、部署 |
| `planReviewers` | 方案审查者，通常两位   |
| `codeReviewers` | 代码审查者，通常两位   |

可以保存多个组合，例如“标准”“省钱”。全局和每个项目（按主仓库路径，所有 worktree 共用）各指定一个默认组合。所有配置都在对话中完成，不用手改文件：

| 你说                                       | 效果                         |
| ------------------------------------------ | ---------------------------- |
| `/paseo-team setup`                        | 引导新建、修改组合或设置默认 |
| “新建组合 省钱：pi-deepseek 开发，QA 审查” | 新建组合                     |
| “这个项目默认用省钱” / “全局默认用标准”    | 设置默认组合                 |
| `/paseo-team 用省钱组合，修复 X`           | 本任务使用指定组合           |
| `/paseo-team 让 pi-deepseek 开发，修复 X`  | 本任务临时点名，不写配置     |
| `/paseo-team status`                       | 查看组合和当前生效的组合     |

选用顺序：任务里点名 > 任务里指定的组合 > 项目默认 > 全局默认。主控不需要配置，你在 Paseo 新建 agent 时选的 Profile 就是主控。审查者尽量选和 Developer 不同的模型，同源模型容易犯同样的错误。

## 日常使用

```text
/paseo-team 给列表增加空状态提示
/paseo-team 重构结算流程，需要审查
/paseo-team 修复这个拼写错误，不要审查
/paseo-team 让 pi-deepseek 开发，QA 和 Architect 审查代码
/paseo-team 用省钱组合，给设置页加导出按钮
```

- **审查何时开启**：你明确要求，或主控判断需求复杂、困难时自动开启，并用一句话说明原因。简单需求或你说“不要审查”时不开。
- **审查方式**：首轮背靠背；阻断意见必须有位置和出错场景；代码争议由 Developer 写测试复现，用证据裁决；方案争议最多两轮，仍有分歧时交给你决定。详见 [对抗性审查](skills/paseo-team/references/review.md)。
- 同一任务里直接说“继续”“修复刚才的问题”，会沿用原来的成员和会话。
- **多任务并行**：可以同时开多个主控，做同一项目或不同项目的任务。每个任务有自己的任务目录和成员记录，只按记录中的 agent ID 联系自己的 agent；任务开始后修改配置不影响它。worktree 锁隔离工作区，发布锁串行合并 main。

## Worktree 与交付

为节省 Rust 等项目的编译时间和磁盘，Developer 复用空闲的 worktree（未加锁、干净、分支已并入 main），并用 `git worktree lock` 占用。合并成功后自动解锁；会话关闭或崩溃时锁保留。没有可用的 worktree 时，由你决定释放哪个或新建。

默认只交付候选。获得授权后，Developer 用 `workflow.mjs merge` 持锁快进 main，再按授权 push 或部署。详见 [Developer 指引](skills/paseo-team/references/developer.md)。

## 源码与开发

```text
skills/paseo-team/SKILL.md                主控入口：角色、配置、流程、审查触发、安全
skills/paseo-team/references/review.md    主控的审查发起与裁决规则
skills/paseo-team/references/developer.md Developer 指引：worktree、检查、回报、合并
skills/paseo-team/references/reviewer.md  审查者指引：只读、证据、结论格式
skills/paseo-team/scripts/workflow.mjs    Git 状态检查、持锁快进、合并后解锁
skills/paseo-team/scripts/run-check.mjs   检查日志落盘、保留退出码和有界摘录
skills/paseo-team/agents/openai.yaml      Codex 显式调用设置
```

```bash
npm ci
npm run format
npm run ci
```

测试不加载凭据、不调用模型。自动检查不能证明模型在真实任务中遵守角色和审查规则。
