# Agent Note: 省 token 的分支合并工作流

Status: implemented

[English](2026-08-20-token-frugal-branch-merge-workflow.md) | 中文

## 问题

把更新后的主干合入功能分支并解决冲突时,agent 的大部分预算花在探索而非判断上:探测分支拓扑、在缓慢的检出环境里重试命令、现场寻找仓库自带的配对解析器与验证门禁、逐行阅读生成类冲突。每次合并都重复同样的探索;而冲突中的机械性多数(配对记录、lockfile)本可由仓库工具处理,agent 却只能靠试错发现它们。

## 决策

仓库新增一个工作流 skill 与一个非模型可见的摘要脚本,让 agent 先分类、再阅读。

`.agents/skills/dsh-merging-branches/SKILL.md` 规定完整流程:预检拓扑与工作树状态、`git merge --no-ff`、按路径模式对冲突分类、按类别解决(配对记录走 `resolve-translation-pairing-conflicts`,lockfile 取字母序并集并用 `pnpm install` 验证,生成文档走其新鲜度门禁)、合并后一致性清单(工作区版本、残留目录、冗余的 `packageFileExtras`、依赖同步)、固定的验证顺序,以及提交与推送。

`scripts/merge-conflict-summary.ts`(通过 `pnpm run merge-conflict-summary` 运行)为进行中的合并输出一份结构化报告:分支拓扑、未合并文件清单,以及每个文件的分类(`pairing-record` / `lockfile` / `manual`)与 blob 行数。agent 只阅读 `manual` 类冲突;配对记录与 lockfile 交由仓库工具解决,不做逐行阅读。

该脚本是普通仓库脚本,不是模型可见的工具包:无需目录注册、没有 Model Experience 表面、不承担单文件覆盖率门禁。其分类规则与配对解析器已经编码的路径过滤条件一致。

## 验证

该脚本的报告曾针对一次真实冲突合并(13 个未合并文件:7 个配对记录、1 个 lockfile、5 个手工冲突)生成,与那次合并实际采用的解决路径一致。`pnpm run verify-skill-invocation-metadata` 保证该 skill 的 Claude/Codex 调用元数据对齐;脚本在 host tsconfig 面下通过类型检查。

## 备选方案

**模型可见的工具包(`tool-git-merge`)。** token 节省最大,但代价是一个承担单文件 100% 覆盖率、目录注册(包括生成工具目录的期望清单)、Model Experience 文档,并作为模型可见表面长期维护的包。摘要脚本以极小成本获得了其中大部分节省。

**只有 skill、不写脚本。** 消除了现场发现成本,但每次合并的探测命令仍留在 agent 上下文里;脚本还能把拓扑与分类折叠成一次读取。

## 影响

处理合并的 agent 只阅读手工冲突与固定检查清单。脚本刻意保持只读:它只分类与报告,绝不暂存或修改,因此错误的分类不可能改动合并状态。仓库门禁仍是验证的权威;skill 中的检查顺序是为了快速失败,而非取代 `doc-sync` 或 CI。
