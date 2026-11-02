# 执行接口

本文件只说明团队解析、派发和交付接口。setup 或修改默认团队时才读 [配置管理](configuration.md)。

## 选人和会话

从本机官方 `paseo` 能力取得 Profiles/notes，将公开字段 `id/name/provider/model/modeId/thinkingOptionId/featureValues/notes` 保存为 `profiles.json`。主控身份来自可信运行环境，不能用 Developer 身份推断。

```text
node <skill-dir>/scripts/team.mjs resolve --lead codex --profiles <profiles.json> --snapshot <task-dir>/team.json --task-id <id> --repo <repo>
```

优先级为本次参数 → preset → 当前主控默认 → 通用默认；显式 `null` 不回退。目标与参数分开，不把用户原文拼成 shell 命令。可用 `--dev`、`--preset`；`--audit` 同时控制方案和交付，不能与分别控制阶段的 `--plan`/`--review` 混用。本次任一审查参数替换 preset 的整个审查范围，`--audit 0` 关闭全部审查。自然语言“审查一下”默认交付两人，“完整对抗性审查”默认两阶段各两人；具体要求优先。

将快照放在候选外的任务目录，不覆盖已有快照。使用所选 Profile 的完整设置；缺失、不兼容或无法确认时报告，不自行换人、降档或减少人数。无配置时，工具仅在唯一匹配时生成旧 Developer/Codex、QA/Codex、Architect/Claude 的兼容草案，不替 Codex 主控自动补 Claude。

按输出的 `provider/model` 调用官方 `create_agent`，将 `modeId/thinkingOptionId/featureValues` 映射到真实 schema，不传不存在的 `profile` 参数。核对返回身份与设置，不符时停止该成员后续工作并说明。

任务记录保留 task_id、阶段、Agent ID、冻结名单、方案/验收（P/AC）、基线/候选（M/C）及证据入口。续聊复用记录与会话；缺名单时运行 `team.mjs status --snapshot <task-dir>/team.json`，不重新 resolve。用户换人时另存新阶段/快照；旧批准不能自动沿用。仅分析任务不调用要求 Developer 的解析流程。

## 交接

主控负责架构与方案，Developer 负责探索、实现与验证。任务如何分析、是否需要调研、如何拆分工作，由成员依职责和实际情况判断。

按官方 `paseo-handoff` 交接原始目标、约束、验收、实际路径、基线、已有方案和交付终点。保留用户语义，去掉 Skill 调用前缀及已解析选人参数；接收者只执行本角色，不重新启动团队。

已有任务 worktree 和 Developer 会话继续复用，避免重复探索和搬运完整历史。派出后等完成通知，不轮询。独立审查仅按用户选定范围走 [审查协作](review.md)。

## 交付

Developer 按项目要求验证，提供候选版本、完成情况、检查结果、问题或未知及证据入口。完整检查日志可用 [检查输出工具](checks.md) 保存；普通检查与真实凭据验证的边界见该说明。

优先复用已有 CI 或交付索引；验证证据须对应实际候选，不强制创建报告体系。主控负责综合结果与交付判断，按需取用原始材料。

默认返回候选；用户授权本地合并后，由 Developer 按 [Git 工具](tools.md) 持锁检查并快进 main。已选审查须收齐全体对同一版本的批准。

最终说明结果、验证、候选、是否审查/合并及剩余问题。费用与 token 只报告实际可取得的数据，不为统计另开 Agent 或扫描全机日志。
