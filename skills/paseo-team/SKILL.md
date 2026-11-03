---
name: paseo-team
description: 当前对话作为主控负责根因、架构与关键决策，配置的 Developer 实现与验证，复杂任务自动加入方案与代码的对抗性审查；复用 Paseo 官方 handoff、advisor、committee。
argument-hint: "[setup | status | 任务描述，可写“需要审查”“不要审查”“用 X 组合”或点名 Profile]"
disable-model-invocation: true
---

# Paseo Team

本 Skill 只补充官方 Paseo Skills 没有的部分：角色组合、审查触发与裁决、worktree 占用、子 agent 安全约定和合并工具。派发、建 agent、咨询审查者都使用官方能力。

## 角色

| 角色      | 由谁担任                                           | 职责                                                                         | 边界                                                   |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| 主控      | 当前对话，即用户在 Paseo 新建 agent 时选的 Profile | 根因分析、架构与方案、关键决策、审查裁决、验收                               | 不写业务代码，不跑测试、不读长日志，不上服务器收集数据 |
| Developer | 所选组合的 `developer`                             | 实现、测试、修复；收集服务器数据；main 前进时变基后合并；获授权后 push、部署 | 候选的唯一写入者                                       |
| 审查者    | 所选组合的 `planReviewers` / `codeReviewers`       | 独立、只读地评估方案或候选                                                   | 不修改任何文件                                         |

**按 token 判断是否重活**：预计读入量大（整文件、多文件、日志、长命令输出）或写出量大（代码、测试、长文档）的步骤是重活，交给 Developer；主控只做读入少、判断价值高的步骤，例如读关键代码片段、做决策、写方案。参考线：单次输出预计超过约 200 行，或需要连续跑多条探查命令，就交出去。拿不准时先让 Developer 收集，主控读摘要和关键片段。

主控亲自做根因判断，不要让 Developer 先自由探索再转述，转述会丢失根因线索。常见重活：上服务器或 VPS 收集数据、拉日志、复现、跑测试、大范围机械搜索。主控写明要查的问题和假设，Developer 只读收集，把原始输出存进任务目录，回报精简的事实；主控需要时再读原始文件里的具体片段，并可以追问下一轮要查什么。

## 配置

本机本用户共享 `~/.config/paseo-team/config.json`，按 Profile 名称保存。一个**组合**包含开发者、方案审查者和代码审查者；全局和每个项目各指定一个默认组合：

```json
{
  "schemaVersion": 3,
  "teams": {
    "标准": {
      "developer": "Developer",
      "planReviewers": ["QA", "pi-deepseek"],
      "codeReviewers": ["QA", "pi-deepseek"]
    },
    "省钱": {
      "developer": "pi-deepseek",
      "planReviewers": ["QA"],
      "codeReviewers": ["QA"]
    }
  },
  "default": "标准",
  "projects": { "/home/me/repo-a": "省钱" }
}
```

- **项目路径**：主仓库检出目录，即 `git rev-parse --path-format=absolute --git-common-dir` 去掉末尾的 `/.git`，因此同一项目的所有 worktree 共用同一个默认组合。不是 Git 仓库时用当前目录。
- **选用顺序**：任务里点名的 Profile > 任务里指定的组合 > 项目默认组合 > 全局默认组合。点名只对本任务生效，不写入配置；点名只涉及部分角色时，其余角色取自按同样顺序选出的组合。Profile 或组合不存在时报告，不自行替换或减少人数。
- 文件不存在或 `schemaVersion` 不是 3：先执行 setup。旧版配置中的成员作为推荐项转换过来。
- **setup**：用户说 `setup`，或“新建组合 X：……”“修改组合 X”“这个项目默认用 X”“全局默认用 X”“删除组合 X”。调用 `list_profiles`，用表格列出名称、模型和思考档位；用选择题询问要做的事和缺少的信息，当前值作为推荐项。审查者与 Developer 是同一模型时提醒用户：同源模型容易犯同样的错误。保存前重新读取文件，只改动本次涉及的字段，然后回显结果。仍被全局或项目默认引用的组合不能删除。setup 不启动任何 agent，也不影响已经开始的任务。
- **项目权限（仅 Claude 主控）**：setup 结束时运行 `node <本 Skill 目录>/scripts/allow-paseo.mjs --check`，只检查、不修改。输出 `OK` 就不提。输出 `MISSING` 时，向用户说明以下内容，并给出命令 `! node <本 Skill 目录>/scripts/allow-paseo.mjs`，请用户自己执行（Paseo 界面不支持 `!` 时在终端的项目目录里执行，去掉 `!`）：
  - **为什么需要**：auto mode 会不定时拦下主控创建 agent、给 agent 发消息，任务因此中断，需要用户确认后重试。
  - **它做什么**：只往当前项目的 `.claude/settings.local.json` 的 `permissions.allow` 追加 `mcp__paseo__create_agent` 和 `mcp__paseo__send_agent_prompt`。已有就跳过；其他配置原样保留；文件不是有效 JSON 时不做任何修改；不输出文件内容。只影响这个项目。
  - **代价**：在这个项目里，主控创建 agent 和发消息不再经过 auto mode 检查，例如“交给 Developer 去部署”这一步不会再被拦，防止越权部署只靠本 Skill 的授权规则。其他操作照常检查。
  - **为什么要用户执行**：Claude Code 不允许 agent 放宽自己的权限，对话中的授权也不算，主控执行会被拦下。主控不得自己运行它，也不要换方式绕过。
  - **怎么撤销**：从该文件的 `permissions.allow` 删掉这两项。
- **status**：列出所有组合，标出全局默认、当前项目默认和当前项目实际生效的组合，以及失效的 Profile。

## 流程

1. 读取配置，按选用顺序确定本任务成员，把组合名和成员写入任务记录。主控分析根因，写出方案和验收标准，保存到任务目录。
2. 判断是否审查（见下节）。需要方案审查时，在实现前按 [对抗性审查](references/review.md) 进行。
3. 用官方 `paseo-handoff` 派发 Developer：明确传入本任务记录中的 Profile 名称，使用当前 workspace，不另建 worktree。简报在官方模板之外还必须包含：
   - 先读并遵守 `<本 Skill 目录>/references/developer.md`（worktree 加锁、检查、回报、合并）；
   - task_id 和任务目录（检查日志写到这里，不写 `/tmp`）；
   - 下方“安全”一节的原文；
   - 本次授权范围：是否允许 push、部署；用户要求只交付候选时也写明。
4. 等待完成通知，不轮询。同一任务的后续工作用 `send_agent_prompt` 发给同一个 Developer。
5. 需要代码审查时，按 [对抗性审查](references/review.md) 进行。
6. 验收：主控阅读 Developer 回报和 diff stat，必要时抽查关键 diff，不重跑测试。
7. 验收通过，并且选了代码审查的也已通过后，主控自己运行 `node <本 Skill 目录>/scripts/workflow.mjs merge --main <主检出目录> --task <worktree> --base <基线> --candidate <候选>`，快进合并到本地 main，成功后自动解锁 worktree，不必再唤醒 Developer。返回 `BLOCKED` 且 `mainAtBase` 为 false 时，才通知 Developer 按 `developer.md` 变基、重跑检查后合并；其他 `BLOCKED` 或锁忙时报告原因。用户说过“不要合并”“只交付候选”时跳过这一步。push 和部署只在用户授权后执行。

## 何时审查

- **开启**：用户明确要求；或主控判断需求复杂、困难，例如跨模块设计、数据或资金相关、并发、不可逆操作、根因不确定。用户要求审查但没指定阶段时，简单任务只做代码审查，复杂任务方案和代码都审；主控自动开启时两个阶段都审。用户指定了阶段或人数时，按用户的要求。
- **不开**：简单需求，或用户说不要审查。
- 自动开启时用一句话说明原因，然后直接进行，不等确认。

## Worktree 占用

Developer 按 `developer.md` 复用空闲 worktree，并用 `git worktree lock` 占用，合并成功后自动释放。Developer 报告没有可用 worktree 时：

- 锁原因以 `paseo-team` 开头、分支已并入 main、工作区干净，并且锁原因中的任务已结束或其 Developer 已关闭：主控可让 Developer 解锁后复用。
- 其他情况不碰锁。主控列出各个锁的原因、时间和是否已合并，由用户决定释放哪个或新建 worktree。

用户放弃任务时，主控让 Developer 确认没有需要保留的改动后再解锁；有未提交的改动时保留锁并报告。

## 官方 Skill 复用

- 派发：`paseo-handoff`。Profile 映射到 `create_agent` 参数的规则见官方 `paseo`。
- 审查：每位审查者使用一个 `paseo-advisor --profile <名称>`。
- 根因难以确定或反复失败：可用 `paseo-committee` 一起分析。
- Paseo 工具异常：`paseo-help`。

与官方 Skill 的两处差异：成员以配置或用户点名为准，不按 notes 自选；审查不使用 committee 的“来回转述直到收敛”。

## 安全

主控遵守以下规则，并把它原文写入每个子 agent 的简报，因为子 agent 未必配置了同样的全局规则：

> 禁止读取、搜索、复制、输出或上传 `.env` 及其他秘密文件；不执行 `env`、`printenv` 等列出全部环境变量的命令；只能检查任务需要的特定变量是否已配置，输出仅限 configured 或 missing。格式化、lint、单元测试隔离真实凭据（`SKIP_DOTENV=true`、`DOTENV_CONFIG_PATH=/dev/null`）。真实 API 验证只能由已检查过、不会打印凭据的可信程序在内部加载配置。凭据存在不代表获准交易、部署、发送消息或修改远程数据。

## 任务记录与并行任务

同一项目或不同项目可能同时有多个主控在运行，每个主控只管理自己的任务：

- **任务目录**：每个新任务新建 `~/.local/state/paseo-team/<项目目录名>/<YYYYMMDD>-<短名>/`，重名就加后缀；项目已有任务目录约定时用项目的。不写入、也不复用其他任务的目录。
- **任务记录**：在任务目录记录 task_id、项目路径、本任务成员（Profile 名称）、各 agent ID、worktree、基线和候选 commit、方案与验收路径、证据路径。续聊只按自己的记录恢复，不重新读取配置或重新选人。
- **识别 agent**：只认任务记录中的 agent ID。`create_agent` 返回后立即写入记录；续聊、复审、裁决时都按 ID 发消息。标题和 labels（`task=<task_id>`、`role=developer|plan-reviewer|code-reviewer`）可能被修改，只方便人辨认，不能用来查找或判断归属。
- **共享资源**：主检出目录可能被其他任务共用，主控和 Developer 都不在其中切换分支或修改文件。工作区靠 worktree 锁隔离，合并 main 靠 `workflow.mjs` 的发布锁串行，main 已前进时由 Developer 按 `developer.md` 变基后重新验证。

本次命令或目标：$ARGUMENTS
