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

## 配置角色

在 Paseo 中准备好 Profiles，然后在对话里执行 `/paseo-team setup`（Codex 中为 `$paseo-team setup`）。主控会列出你的 Profiles，用选择题询问三个角色，并保存到 `~/.config/paseo-team/config.json`：

| 角色            | 作用                   |
| --------------- | ---------------------- |
| `developer`     | 实现、测试、修复、部署 |
| `planReviewers` | 方案审查者，通常两位   |
| `codeReviewers` | 代码审查者，通常两位   |

主控不需要配置：你在 Paseo 新建 agent 时选的 Profile 就是主控。模型换代后，重新 setup，或直接说“开发换成 X”“审查改用 A、B”即可，不用手改文件。审查者尽量选和 Developer 不同的模型，同源模型容易犯同样的错误。

`/paseo-team status` 查看当前配置。

## 日常使用

```text
/paseo-team 给列表增加空状态提示
/paseo-team 重构结算流程，需要审查
/paseo-team 修复这个拼写错误，不要审查
/paseo-team 让 pi-deepseek 开发，QA 和 Architect 审查代码
```

- **审查何时开启**：你明确要求，或主控判断需求复杂、困难时自动开启，并用一句话说明原因。简单需求或你说“不要审查”时不开。
- **审查方式**：首轮背靠背；阻断意见必须有位置和出错场景；代码争议由 Developer 写测试复现，用证据裁决；方案争议最多两轮，仍有分歧时交给你决定。详见 [对抗性审查](skills/paseo-team/references/review.md)。
- 同一任务里直接说“继续”“修复刚才的问题”，会沿用原来的成员和会话。

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
