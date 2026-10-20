# Paseo Team

Claude 负责方案，Codex 负责实现验证；简单任务直接返回，复杂方案和重要交付再启用独立审查。

这是面向 **Claude Code + Paseo** 的个人 Skill。复用现有 Architect、Developer、QA Profiles 和官方 Paseo 能力，保持模型、思考档位与权限配置。优化目标是完成原始需求，同时减少总耗时、费用和返工。

```text
明确目标、必需验收与非目标
    ↓
Claude 短方案 ── 关键问题不明确时：独立方案委员会
    ↓
paseo-handoff → Codex 实现、必要验证、固定候选
    ↓
简单任务：核对结果后返回
重要交付 / 用户要求 review：独立 Claude + Codex 双审
    ↓
已授权本地合并时：共同锁内检查 → 快进 main
```

**不再要求所有代码交付都双审。** 局部修改、普通原型或演示默认轻量协作；用户可以明确说“不要 review”。省略审查不省略必要验证，也不能把未审查写成已审通过。

## 安装与更新

先安装 [Paseo 官方 Skills](https://paseo.sh/docs/skills)，准备本次工作所需 Profiles：

| Profile   | Provider | 用途                                    |
| --------- | -------- | --------------------------------------- |
| Architect | Claude   | 当前主持者；按需创建方案成员或 Reviewer |
| Developer | Codex    | 唯一实现者，执行验证和 Git 写操作       |
| QA        | Codex    | 仅审查或独立验证时需要                  |

轻量模式只需要官方 `paseo`、`paseo-handoff`；需要审查时才读取 `paseo-committee`、`paseo-advisor`，异常时再读 `paseo-help`。不为轻量任务要求额外 QA，不自动更换模型或降低思考档位。

使用 skills CLI 安装到 Claude Code：

```bash
npx skills add jiffies/paseo-team --skill paseo-team -a claude-code -g
```

本地源码安装：

```bash
git clone https://github.com/jiffies/paseo-team.git
cd paseo-team
npx skills add . --skill paseo-team -a claude-code -g
```

升级前把已有自定义版本备份到 Skills 目录之外。更新源码后重新执行安装命令，确保 `SKILL.md`、`references/`、`scripts/` 一起安装，不只复制入口文件。已运行的会话需明确重新读取新版，或为新任务新建会话；不会强行中断现有任务。

Skill 的运行时工具只需要 Node.js 22+ 和 Git；自动合并额外需要 Linux/WSL 的 `flock`。使用 Skill 无需安装此仓库的 npm 开发依赖。

## 使用

在 Paseo 中使用 Architect Profile 打开 Claude：

```text
/paseo-team 画一个鹈鹕骑自行车的 3D 动画，做简单合作，完成后返回，不要 review。
```

普通任务也可以不指定模式，由 Claude 按实际风险简短说明选择：

```text
/paseo-team 给列表增加空状态提示，沿用已有样式，验证后返回。
```

重要任务或明确需要审查时：

```text
/paseo-team 修改订单结算逻辑，先确认方案，完成独立双审后合入本地 main，不推送。
```

委员会与交付双审分别决定。复杂或关键假设不明的方案先讨论；资金、权限、迁移、并发/恢复、重要跨模块契约等交付按需双审。用户明确不要 review 时不暗中启动审查者，但保留必要验证和实际授权边界。

默认交付候选后返回，已授权时才合入本地 main。已有任务 worktree 直接复用，不重复创建，也不要求每个项目先手填 worktree setup scripts。入口仍是 `/paseo-team`，当前 Claude 保留主持责任，没有新增接单 Agent 或常驻协调器。

## 如何减少耗时与成本

- 先明确必需验收，防止自行增加需求和过度设计。
- 根据任务读取必要 Skill，避免反复加载未变的全文。
- 一次交接目标、路径、验收和约束，独立检查并行执行。
- 主控处理状态与实质分歧，不重复做第三份全量审查。
- 成员默认短回报；完整结论留在会话记录，通知截断时补读。
- 修复复用 Reviewer 会话，复审变化与影响，重新批准同一候选。
- Git 状态与合并用固定工具执行，不每次生成一次性脚本。
- 沿用项目检查，纯证据按任务保存在稳定位置，避免只留 `/tmp`。
- 使用可取得的运行数据记录耗时、token、估算费用、修复轮次；不为统计额外启动审计团队。

不通过降低模型、思考档位或修改全局配置节省费用。token 数不是账单，缓存类型与模型单价应分开计算；并行 Agent 的时长不能直接相加。

## 审查与合并边界

需要审查时，两位新 Reviewer 独立检查“原始需求 → 实现 → 调用路径 → 可观察行为 → 验证证据”，而不是只看作者摘要。设计、实现和独立动态验证者的旧会话不能代替最终 Reviewer。只读角色不运行会写文件的测试，动态验证交 Codex。

候选变化会使原批准失效；双方可做增量复审，但都须确认新候选。有依据的阻断和关键未知不能被预算、投票或完成状态消除。详见 [审查流程](skills/paseo-team/references/review.md)。

可复用的 [工作流工具](skills/paseo-team/references/tools.md) 将 Git 机械检查合并成一次调用。授权合并时，在 Git common directory 的 `main-publish.lock` 下重新检查 M/C、两个工作树及未完成操作，只快进到固定候选。已有 `herdr-main-publish.lock` 会作为兼容锁一起持有，不调用 Herdr、不删除或改名旧锁。锁忙或状态不符就保留现场并报告。

锁只保护遵守共同协议的写入者，工具也不检查需求或代替 Reviewer 的批准。不得覆盖用户改动，不自动 reset、stash、push、删除 worktree 或部署。

禁止读取、搜索内容、打印、复制或上传 `.env` 和其他秘密。普通检查隔离凭据；明确授权的真实 API 验证仅允许可信目标程序内部加载配置，不允许 Agent 查看凭据内容。

## 源码与维护

```text
skills/paseo-team/SKILL.md              按需协作入口
skills/paseo-team/references/review.md  委员会与独立双审（按需读取）
skills/paseo-team/references/tools.md   Git 工具用法（按需读取）
skills/paseo-team/scripts/workflow.mjs  状态检查与持锁快进，无 npm 依赖
scripts/check.mjs                     Claude 元数据、Markdown 与引用检查
tests/                                校验器与临时 Git 仓库集成测试
docs/verification.md                  验证范围与行为评估
```

开发使用 Node.js 22 或 24：

```bash
npm ci
npm run format
npm run check
npm run ci
```

检查不加载 `.env` 或调用模型。Git 集成测试只操作临时仓库；CI 验证格式、元数据、引用和工具行为，不代表已跑真实 Claude/Paseo 联动。详见 [验证说明](docs/verification.md)。

本项目由用户提供的 `paseo-team-adversarial-v2.zip` 演进而来。v3 将全量双审改为按需启用，增加轻量协作、成本与耗时目标，以及可复用的机械检查；原有独立审查原则仍用于需要它的任务。

## 官方参考

实际执行以本机官方 Skill 和实时 Profiles/工具能力为准，不复制上游实现。

- [Paseo 基础 Skill](https://github.com/getpaseo/paseo/blob/main/skills/paseo/SKILL.md)
- [方案委员会](https://github.com/getpaseo/paseo/blob/main/skills/paseo-committee/SKILL.md)
- [独立顾问](https://github.com/getpaseo/paseo/blob/main/skills/paseo-advisor/SKILL.md)
- [任务交接](https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md)
- [Agent Profiles](https://paseo.sh/docs/agent-profiles)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
