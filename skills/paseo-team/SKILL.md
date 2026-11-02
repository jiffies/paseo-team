---
name: paseo-team
description: 当前对话作为主控负责根因、架构与关键决策，配置的 Developer 实现与验证，复杂任务自动加入方案与代码的对抗性审查；复用 Paseo 官方 handoff、advisor、committee。
argument-hint: "[setup | status | 任务描述，可写“需要审查”“不要审查”或点名 Profile]"
disable-model-invocation: true
---

# Paseo Team

本 Skill 只补充官方 Paseo Skills 没有的部分：角色配置、审查触发与裁决、worktree 占用、子 agent 安全约定和合并工具。派发、建 agent、咨询审查者都使用官方能力。

## 角色

| 角色      | 由谁担任                                           | 职责                                           | 边界                               |
| --------- | -------------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| 主控      | 当前对话，即用户在 Paseo 新建 agent 时选的 Profile | 根因分析、架构与方案、关键决策、审查裁决、验收 | 不写业务代码，不跑测试、不读长日志 |
| Developer | 配置的 `developer`                                 | 实现、测试、修复；获授权后合并、push、部署     | 候选的唯一写入者                   |
| 审查者    | 配置的 `planReviewers` / `codeReviewers`           | 独立、只读地评估方案或候选                     | 不修改任何文件                     |

主控亲自读代码、找根因，不要让 Developer 先探索再转述，转述会丢失根因线索。只把复现、跑测试、抓日志和大范围机械搜索交给 Developer。

## 配置

本机本用户共享 `~/.config/paseo-team/config.json`，按 Profile 名称保存。顶层是全局默认，`projects` 按项目路径覆盖：

```json
{
  "schemaVersion": 2,
  "developer": "Developer",
  "planReviewers": ["QA", "pi-deepseek"],
  "codeReviewers": ["QA", "pi-deepseek"],
  "projects": {
    "/home/me/repo-a": { "developer": "pi-deepseek" }
  }
}
```

- **项目路径**：主仓库检出目录，即 `git rev-parse --path-format=absolute --git-common-dir` 去掉末尾的 `/.git`，因此同一项目的所有 worktree 共用一份项目配置。不是 Git 仓库时用当前目录。
- **优先级**：本次任务点名 > 项目配置 > 全局配置，逐个角色合并；项目里没写的角色沿用全局。点名不修改配置。Profile 不存在时报告，不自行替换或减少人数。
- 文件不存在或 `schemaVersion` 不是 2：先执行 setup。
- `setup`，或用户说“开发换成 X”“审查改用 A、B”：调用 `list_profiles`，用表格列出名称、模型和思考档位；用选择题询问作用范围（当前项目或全局，用户没说明时询问）和要设置的角色，当前生效值或旧配置对应的 Profile 作为推荐项。审查者与 Developer 是同一模型时提醒用户：同源模型容易犯同样的错误。保存前重新读取文件，只改动选定范围内的字段，保留其他项目和全局设置，然后回显结果。setup 不启动任何 agent，也不影响已经开始的任务。
- `status`：列出当前项目每个角色的生效 Profile、来源（项目或全局）和失效项。

## 流程

1. 读取配置，确定本任务成员并写入任务记录。主控分析根因，写出方案和验收标准，保存到任务目录。
2. 判断是否审查（见下节）。需要方案审查时，在实现前按 [对抗性审查](references/review.md) 进行。
3. 用官方 `paseo-handoff` 派发 Developer：明确传入配置的 Profile 名称，使用当前 workspace，不另建 worktree。简报在官方模板之外还必须包含：
   - 先读并遵守 `<本 Skill 目录>/references/developer.md`（worktree 加锁、检查、回报、合并）；
   - 下方“安全”一节的原文；
   - 本次授权范围：是否允许合并、push、部署。
4. 等待完成通知，不轮询。同一任务的后续工作用 `send_agent_prompt` 发给同一个 Developer。
5. 需要代码审查时，按 [对抗性审查](references/review.md) 进行。
6. 验收：主控阅读 Developer 回报和 diff stat，必要时抽查关键 diff，不重跑测试。
7. 合并、push、部署只在用户授权后由 Developer 执行。

## 何时审查

- **开启**：用户明确要求；或主控判断需求复杂、困难，例如跨模块设计、数据或资金相关、并发、不可逆操作、根因不确定。默认方案和代码两个阶段都审；用户指定了阶段或人数时，按用户的要求。
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
