# 团队配置管理

## 作用域与优先级

同一 WSL/Paseo 主机、同一用户共用 `~/.config/paseo-team/config.json`。Claude 与 Codex 都在这台 WSL 中运行工具；Windows 本机、另一台服务器或另一用户的 home 不会自动共享这份配置。本版不增加项目级配置。

配置保存成员到 Profile ID 的映射，不保存凭据或 Provider 连接地址。主控默认按 `byLead.claude`、`byLead.codex` 等选择；身份来自当前运行环境或明确的用户选择，不猜模型自称，不读取秘密文件。改用同一 CLI 中的另一个模型时，默认仍按该主控键选择；需要区分时由用户指定并配置额外主控键。

本次 `--dev` 优先于 preset、主控默认和通用默认。`reviewTeams` 只是用户指定人数时的选人表，**并不自动启用审查**。字段缺失可继承通用默认，显式 `null` 则表示尚未配置，不能继承。Codex 未配置审查组时不默认调用 Claude。

`--audit` 同时指定方案与交付阶段，不能与 `--plan`/`--review` 混用。后两者可一起使用，也可各选不同名单。任一本次审查参数都会替换 preset 的整个审查范围：例如 `--preset full --review 2` 只做交付审查，`--audit 0` 关闭所有审查。重复参数、未知别名、不足人数或重复 Profile 都报错，不静默修正。

## setup：一次配置，后续新对话自动读取

1. 读取本机官方 `paseo` 使用说明，调用 `list_profiles`。不要编造 `paseo profiles` 命令；如本机没有该工具，说明需要接通官方 Paseo 能力，不直接打开 daemon 配置或凭据文件。保留公开字段 `id/name/provider/model/modeId/thinkingOptionId/featureValues/notes`，写到本次配置工作目录的 `profiles.json`。
2. 运行 `node <skill-dir>/scripts/team.mjs setup --profiles <profiles.json>`。返回当前 revision、已有配置或兼容草案、真实 Profiles，尚不写配置或启动 Agent。
3. 一次询问：成员别名如何绑定开发/审查 Profile；Claude、Codex 等主控分别默认谁开发、两/三人组是谁；是否保存常用组合。列出真实 Profile 名、模型和模式供用户选，不要求其手填 ID。已有明确偏好直接沿用，不再确认；未配置的可选人数留 `null`。
4. 根据答复生成公开 `choices.json`，运行 `setup --profiles <profiles.json> --input <choices.json> --expected-revision N`。校验通过才保存；revision 冲突重新读取、合并，不能覆盖另一会话的更新。
5. 返回各主控默认、配置位置，提醒默认仍不审查。setup 不派开发者、不做联动测试、不创建或修改 Provider/Profile。

新成员先在 Paseo 中配置可用的 Provider/模型和 Profile，再执行 setup 添加映射；只当开发者时仅绑定 `developer`，只当审查者时仅绑定 `reviewer`，两者都用则分别绑定。可以使用同一个 Profile，但运行角色必须分别新建会话。不要把 DeepSeek 别名硬编码为一个不存在的 Paseo provider：实际 provider/model 从 Profile 原样取值。

下面是结构示例，ID 是说明用名称，不能直接当作真实配置保存：

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "aliases": {
    "claude": { "reviewer": "architect-profile-id" },
    "codex": {
      "developer": "developer-profile-id",
      "reviewer": "qa-profile-id"
    },
    "deepseek": {
      "developer": "deepseek-dev-id",
      "reviewer": "deepseek-review-id"
    }
  },
  "defaults": { "developer": "codex", "reviewTeams": { "2": null, "3": null } },
  "byLead": {
    "claude": {
      "developer": "codex",
      "reviewTeams": {
        "2": ["claude", "codex"],
        "3": ["claude", "codex", "deepseek"]
      }
    },
    "codex": {
      "developer": "codex",
      "reviewTeams": { "2": ["codex", "deepseek"], "3": null }
    }
  },
  "presets": {
    "no-claude": { "dev": "codex", "audit": "codex,deepseek" }
  }
}
```

若用户在 Codex 主控下仍希望三人且不要 Claude，必须有第三个实际可用的审查 Profile；不能擅自补 Claude、复制同一 Profile 凑人数，或把三人减为两人。不同 Profile 可能仍用同一模型，须准确展示，不能宣称已经获得三个不同模型的判断。

## 状态与执行入口

查看全局配置及当前主控默认：`node <skill-dir>/scripts/team.mjs status --lead codex`。需要核对失效绑定时加公开 `--profiles <profiles.json>`。

任务已启动时优先读取已有任务记录，缺少冻结名单才使用 `status --snapshot <task-dir>/team.json`，不重新读取全局默认或重新选人。普通任务的参数解析、Profile 核对、冻结及交接见 [日常执行](execution.md)，无需重读本文件的 setup 示例。

## 常用组合与工具边界

Skill 用户输入：

```text
/paseo-team preset save no-claude --dev codex --audit codex,deepseek
/paseo-team --preset no-claude 本次目标
```

主控读取 `status` 的 revision，再调用 `team.mjs preset save no-claude --dev codex --audit codex,deepseek --expected-revision N`。保存组合不派 Agent；使用包含审查选项的组合才算本次明确启用审查。人数 preset（如 `--audit 2`）使用当前主控的人数组合；明确名单 preset 对不同主控保持相同名单。

工具只管理配置与名单，不自动调用模型，不识别自然语言，不强制执行 Agent 的读写权限或检查审查结论。共享配置保存使用短暂文件锁和 revision 防止覆盖，不在开发或审查阶段持锁；异常退出遗留锁时确认无保存进程再处理，不自动删锁。

完整 `--audit 2` 的通常会话数为：当前主控 + 一个开发者 + 两个方案会话 + 两个新交付会话；`--review 2` 仅增加两个交付会话。方案和交付可以复用 Profiles，不能复用会话。增加人数会增加成本，只在用户选定时执行。
