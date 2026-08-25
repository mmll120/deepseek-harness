# Agent Note：dsh-tool-text——最小无状态工具包

状态：implemented

[English](2026-08-14-dsh-tool-text-text-stats.md) | 中文

## 问题

新增工作区包必须遵循[新增包清单](../../../../docs/cookbook/adding-a-package.zh.md)：包脚手架、聚合注册、README 模型体验、invariant 伴随、双语配对与重新生成的目录。仓库里没有可供复制的、最小的工具形态清单演练，产品也没有供模型使用的纯函数、无状态文本测量工具。一个包可以同时满足两者：完整清单的最小示例，以及一个小型 `wc` 式能力。

## 决策

新建 `packages/text/` 组，内含一个包 `@deepseek-ai/dsh-tool-text`，在 `ctx.tools` 上注册 `text_stats(text)`。计算是纯函数且无状态——`lines` 统计换行分隔段数（空文本计为一行），`words` 统计去首尾空白后按空白分隔的单词数（空文本计为零），`chars` 统计 UTF-16 码元数，`nonWhitespaceChars` 统计不在 Unicode `\s` 类中的字符数，`bytes` 为 UTF-8 字节长度。工具不声明 `presentCall`，因此 UI 使用通用回落卡片；也没有 Config：包不需要部署选择，只依赖 `dsh-tools`、`dsh-invariants` 与 Cordis。

该包端到端遵循清单：`text/` 组 README、`tsconfig.host.json` 中的 project reference、`tsconfig.base.json` 中 `@deepseek-ai/dsh-*` 与 `@deepseek-ai/dsh-*/invariant` 的通配条目、带空安装器理由的 `./invariant` 伴随、带规范模型体验章节的双语 README，以及 `scripts/gen-tool-catalog.ts` 工具目录启动清单中的条目——这是必需的，因为生成器的完整性守卫会扫描每个 `packages/*/tool-*` 叶子，未列入清单的包会直接失败。`docs/tool-catalog.md` 与 `docs/module-graph.md` 在同一改动中重新生成。

测试驱动真实插件：单元 spec 在真实 `ToolRuntime` 上挂载插件并断言 schema、执行、渲染与纤维销毁后的注销；Loader 组合 spec 通过 Loader 启动真实 `cordis.yml` 并在加载出的树上执行；invariant spec 证明伴随保留其包名并在销毁时释放。`src/` 达到逐文件 100% 覆盖率。

## 备选方案

**放在 `packages/examples/` 下作为演示 bundle。** 可避开已发布工具目录并减轻门禁——但重点是演示完整的仓库内清单，而这正是已发布包的路径；演示 bundle 不会迫使生成器清单、配对或 invariant 门禁生效。

**给工具加一个 Config 字段（例如自定义分词模式）。** 可以演示通过 `cordis.yml` 调整，但违背最小化要求，也违反"没有当前消费者就不加可配置性"的规则；无默认值的必填 Config 会迫使每个组合都做出选择。

**复用现有组。** `util/` 是零依赖工具组，而工具依赖 `dsh-tools`；`todo/` 属于任务清单工具族。新建 `text/` 组遵循单包组先例（`todo/`），也让工具的家更名副其实。

**导出公开的 `computeTextStats` 辅助函数。** 可直接单测，但工具包的表面就是 `name`/`inject`/`apply`；辅助函数保持模块私有，通过 `ctx.tools.execute` 像真实调用方一样被覆盖。

## 后果

模型获得了 `text_stats` 工具，仓库也获得了一个最小端到端工具包示例——脚手架、门禁、目录与双语文档——后续工具包可以照抄。代价是发布面新增：一个新组与一个包、一个生成器清单条目和两份重新生成的目录；如果示例完成了使命，删除包、还原生成器条目并重新生成目录即可全部移除。分词与 Unicode 语义按限制记录，而不是做成可配置项。
