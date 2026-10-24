# Git 状态与合并工具

随 Skill 一起安装的 `scripts/workflow.mjs` 使用 Node.js 22+、Git，合并另需 Linux/WSL 的 `flock`。没有 npm 运行时依赖，不读取环境或凭据文件，不调用模型服务。

以下命令由 Developer 执行。将路径和完整提交 ID 替换为本任务实际值；从已安装 Skill 的基目录定位脚本，不要求复制到业务仓库。

这里只检查合并准备状态。只返回任务候选时无需运行；main 已前进或有用户改动并不阻止返回独立 worktree 的已验证候选。`READY` 也只表示具备机械合并条件，不表示质量验收通过。

```bash
node /path/to/paseo-team/scripts/workflow.mjs inspect \
  --main /path/to/main-checkout --task /path/to/task-worktree \
  --base FULL_BASE_COMMIT --candidate FULL_CANDIDATE_COMMIT
```

一次输出候选树身份、main/task 的分支、HEAD、干净状态、进行中的 Git 操作及基线关系。可直接保存 JSON 到本任务证据目录，避免多轮逐条询问。工具不读取源码或秘密内容。

已经按所选模式完成验收，且用户已授权本地合并后：

```bash
node /path/to/paseo-team/scripts/workflow.mjs merge \
  --main /path/to/main-checkout --task /path/to/task-worktree \
  --base FULL_BASE_COMMIT --candidate FULL_CANDIDATE_COMMIT
```

工具在同一个 Git common directory 的 `main-publish.lock` 下重新检查所有状态，只执行 `git merge --ff-only` 到指定候选。若存在 `herdr-main-publish.lock`，先持有兼容锁再拿新锁，旧流程与新流程可以共用保护；不创建旧锁、不改名、不删除锁文件。不支持的环境直接报告，不使用无锁回退。

检查包括：main 仍等于 M，task HEAD 等于 C，C 包含 M，两者属于同一个仓库且都是正确的独立分支/工作树，两个工作树都干净且无未完成 Git 操作。main 变化、脏文件或未跟踪文件都会阻止合并，不 stash、reset、删除或自动解决冲突。合并后再次核对 main=C 和两个工作树状态；hook 等引起意外变化时报告失败，保留现场，不自动回滚。

退出码：`0` 为成功，`1` 为检查未通过或命令失败，`75` 为锁忙。锁忙可等待官方任务进展后再尝试，不循环轮询。退出码非零时保存结果并处理原因，不能当作完成。

锁只协调遵守同一协议的写入者，无法阻止外部终端直接改 main。项目有其他发布者时先确认共享入口或既有共同协议，不能因文件存在就声称已经协调。

工具只检查 Git 机械状态，**不验证需求完成、测试有效或审查批准，也不授予合并权限**。轻量任务无需伪造批准；选择交付审查的任务必须先收齐冻结名单全部成员对同一候选的真实批准。
