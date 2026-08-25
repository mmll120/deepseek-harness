# @deepseek-ai/dsh-tool-text

[English](README.md) | 中文

面向模型的 `text_stats` 工具：纯函数、无副作用的文本测量。它是仓库内最小工具包示例：一个插件文件、一个工具、没有 Config、不耦合会话或代理。

## 它做什么

在 `ctx.tools` 上注册一个工具 `text_stats(text)`。调用是无状态的——它测量传入的字符串并返回规范化结果，不触碰会话、代理、文件或时钟，因此不需要能力接缝，也不需要部署配置。

| 字段 | 语义 |
|---|---|
| `lines` | 换行分隔的段数（`text.split('\n').length`）；空文本计为一行。 |
| `words` | 去除首尾空白后按空白分隔的单词数；空文本或纯空白文本计为零。 |
| `chars` | 输入的 UTF-16 码元长度。 |
| `nonWhitespaceChars` | 不在 Unicode `\s` 类中的字符数。 |
| `bytes` | UTF-8 字节长度（`TextEncoder`）。 |

## 导出形态

函数/命名空间插件：导出 `name` / `inject` / `apply`，没有默认导出。多余的 `export default` 会让 Loader 的 `unwrapExports` 折叠模块并丢掉 `inject`（见 [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md)）。

## 渲染

规范化结果是五个计数器；其 Native 渲染器返回一行紧凑摘要。该工具不声明 `presentCall`/`presentResult`，因此 UI 回落到通用卡片——这是纯测量工具（没有文件、命令或 diff 语义）诚实的渲染意图。

## 模型体验

### 工具 schema

#### 模型看到什么

模型看到生成的 [`text_stats` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-text)。

#### Token 影响

只要工具可见，每次请求都有固定的 schema 开销。

#### KV 缓存影响

定义与可见性不变时前缀稳定。插件生命周期或作用域限制可能使该 schema 的复用失效。

### 工具调用历史与结果

#### 模型看到什么

每次助手工具调用都会在参数中保留提交的 `text`。成功时精确返回 `<lines> lines, <words> words, <chars> chars (<nonWhitespaceChars> non-whitespace), <bytes> bytes.`——例如 `2 lines, 4 words, 22 chars (19 non-whitespace), 22 bytes.` schema 在 `execute` 运行前校验必需的字符串，而任意字符串都可测量，因此没有领域失败路径。

#### Token 影响

Token 增长随提交的 `text` 缩放，且该参数在压缩前一直保留在调用历史中。结果形状固定且很小。

#### KV 缓存影响

追加式；新出现的内容跟在可复用的请求前缀之后，不会使既有 KV 缓存条目失效。

## 已知限制与延期工作

- **不支持文件或流输入**——工具只测量传入的字符串；读文件仍由 fs 工具负责，调用方自行提供文本。
- **朴素的 Unicode 语义**——`chars` 按 UTF-16 码元计数（代理对计为两个），`nonWhitespaceChars` 使用 `\s` 类；字素簇计数不在范围内。
- **没有 Config 面**——工具刻意零配置；未来的部署相关选项（例如自定义分词模式）应作为经过校验的 `Config` 字段加入，而不是常量。
