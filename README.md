# Paseo Team

让方案和交付都经得起独立审查的 Claude Code Skill。

当前 Claude 负责主持，复用现有 Architect、Developer、QA Profiles 和官方 Paseo Skills。复杂任务在定方案前进行独立分析与交叉质疑；Codex 实现、测试；最终由全新会话的 Claude 与 Codex 回到原始需求、真实代码和验证证据，分别判断任务是否完成。

```text
目标、事实与约束
    ↓
复杂任务：paseo-committee 独立分析 → 交换论据
    ↓
方案 P 与验收条件 AC
    ↓
paseo-handoff → Developer / Codex 实现、验证
    ↓
固定基线 M 与候选 C
    ↓
两份 paseo-advisor：独立 Claude + 独立 Codex
    ↓
修复或补证据 → 双方重新批准同一候选
    ↓
各任务分别合入本地 main
```

简单、局部、验收明确的任务可以省略方案委员会。所有代码交付仍需双审。审查允许发现“该做而没做”的需求，也允许以 `BLOCKED` 保留决定性未知；讨论一致不能替代验收证据。

## 安装

适用环境是 **Claude Code + Paseo**，主持者是当前 Claude。先按 [Paseo 官方说明](https://paseo.sh/docs/skills) 安装官方 Skills，并准备以下现有 Profiles：

| Profile   | Provider | 用途                                                            |
| --------- | -------- | --------------------------------------------------------------- |
| Architect | Claude   | 当前主持者、新方案成员、新 Claude Reviewer                      |
| Developer | Codex    | 正式候选唯一写入者，实现与验证                                  |
| QA        | Codex    | 对照方案成员、新 Codex Reviewer；另起会话时也可执行独立动态验证 |

所需官方 Skills 为 `paseo`、`paseo-committee`、`paseo-handoff`、`paseo-advisor`；遇到运行问题再使用 `paseo-help`。每次按本机已安装版本读取用法和 Profiles/notes，不写死模型或工具参数。缺少匹配配置时明确报告。

在 WSL/Ubuntu 中克隆项目：

```bash
git clone https://github.com/jiffies/paseo-team.git
cd paseo-team
```

然后运行以下命令，将旧自定义 Skill 移到 skills 目录之外备份，再安装新版：

```bash
(
  set -eu
  destination="$HOME/.claude/skills/paseo-team"
  backup_root="$HOME/.local/state/paseo-team/backups"
  test -f skills/paseo-team/SKILL.md
  mkdir -p "$HOME/.claude/skills"
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    mkdir -p "$backup_root"
    backup_dir="$(mktemp -d "$backup_root/backup.XXXXXXXX")"
    mv -- "$destination" "$backup_dir/paseo-team"
    printf '旧版备份：%s\n' "$backup_dir/paseo-team"
  fi
  cp -R -- skills/paseo-team "$destination"
)
```

只安装 `skills/paseo-team/`，不需要安装本项目的 Node.js 开发依赖。升级时在源码目录执行 `git pull --ff-only`，再运行上面的备份与复制命令；不要覆盖其他 Skills 或整个 `.claude/`。备份按需保留，未提供自动删除操作。

## 使用

在本任务独立 worktree Workspace 中，使用 Architect Profile 打开 Claude，输入：

```text
/paseo-team 本次目标与约束
```

例如：

```text
/paseo-team 为订单导出增加日期筛选，保持现有列顺序；
完成测试和独立双审后合入本地 main，不推送远端。
```

Skill 保留 `disable-model-invocation: true`，仅显式调用；没有 `context: fork`，当前 Claude 持续负责主持。参数通过 `$ARGUMENTS` 传入。个人安装位置和调用方式见 [Claude Code Skills 文档](https://code.claude.com/docs/en/skills)。

更新期间已有任务不必重建 Worker。可在原聊天中说明：

```text
重新读取更新后的 paseo-team，保留当前任务、Worker 和候选。
按新版规则继续；若现有方案有决定性未知，补方案审查再实施。
```

## 两道关卡

| 关卡     | 主要问题                                           | 必须保留的独立性                         |
| -------- | -------------------------------------------------- | ---------------------------------------- |
| 方案审查 | 问题定义正确吗？假设成立吗？有没有更简单的方案？   | 两人先收到相同事实并独立分析，再交换论据 |
| 交付审查 | 原始需求真的完成了吗？真实调用路径和测试能证明吗？ | 两个全新 Reviewer 会话，首轮互不看结论   |

两位 Reviewer 都检查“需求 → 实现 → 调用路径 → 可观察行为 → 证据”，不能只读作者摘要或 diff。设计参与者、实现者、独立动态验证者的旧会话不能充当最终 Reviewer。

只读 committee/advisor 不运行会写文件的测试。静态检查无法回答的问题，交 Developer 或另起的 QA/Codex 验证任务，在固定候选的隔离副本里运行。

方案 P、验收条件 AC、基线 M、候选 C 绑定审查证据。C/M 或实质 P/AC 变化都会使旧批准失效；双方重新批准同一版本后才能交付。最终合并还要求项目已有可靠共同保护，只快进到已审候选；没有保护则报告候选已审、尚未合入。

## 与官方能力的边界

本项目只维护质量政策，**不附带常驻协调器、运行时强制门禁或新的接单入口**，也不修改官方 Skills、Profiles、provider 和全局权限。

- 委员会的独立分析、交叉讨论来自官方 `paseo-committee`；讨论上限、证据标准和保留未知是本项目的政策。
- 官方 `paseo-handoff` 派出成员后立即返回，不等待或轮询。主 Claude 在之后收到完成通知时继续团队流程；不替用户 detach 成员。
- 官方 `paseo-advisor` 创建单个顾问。本项目先派出两份审查，再收齐报告，形成独立双审。
- 同一 Profile 可以启动多个新会话；运行配置相同不代表上下文相同。
- Full Access 不提供只读隔离，两个 Agent 也可能共享盲点；批准文本不等于程序强制保护。

仅当用户授权时才 push、部署或操作远端数据。不得读取、打印或上传 `.env` 与其他秘密；普通检查隔离真实凭据。已授权的真实 API 验证允许可信目标程序内部加载配置，但不允许 Agent 检查凭据内容。

## 源码与维护

```text
skills/paseo-team/SKILL.md  唯一安装入口，完整工作流
docs/verification.md       验证范围与人工行为评估场景
scripts/check.mjs          Claude frontmatter 与本地引用检查
tests/check.test.mjs       校验器行为测试
.github/workflows/ci.yml   Node.js 自动检查
```

开发环境使用 Node.js 22 或 24。项目不加载 `.env`，检查无需 Paseo、模型服务或 GitHub 凭据。

```bash
npm ci
npm run format
npm run check
npm run ci
```

`format` 整理明确列出的源文件；`check` 检查格式、Markdown、JavaScript 语法、Skill 元数据与本地引用；`ci` 加跑校验器测试。依赖锁文件随仓库提交。CI 检查结构与维护工具，无法证明真实多 Agent 行为；行为评估及联动验证要求见 [验证说明](docs/verification.md)。

此项目由用户提供的 `paseo-team-adversarial-v2.zip` 整理而来：保留原有角色与流程，合并重复规则，明确异步交接、版本绑定和验收边界，增加源码维护检查。没有复制官方 Skill 正文，也没有替用户安装到个人 Skill 目录。

## 官方参考

核对日期：2026-10-20。上游主分支可能变化，实际执行以本机官方 Skill 和工具能力为准。

- [Paseo 基础 Skill](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md)
- [方案委员会](https://github.com/getpaseo/paseo/blob/main/skills/paseo-committee/SKILL.md)
- [独立顾问](https://github.com/getpaseo/paseo/blob/main/skills/paseo-advisor/SKILL.md)
- [任务交接](https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md)
- [Agent Profiles](https://paseo.sh/docs/agent-profiles)
- [官方 Skills 安装](https://paseo.sh/docs/skills)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
