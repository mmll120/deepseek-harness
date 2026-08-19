# `@deepseek-ai/dsh-desktop-app`

[English](README.md) | 中文

dsh 桌面表层组合包。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-base`](../base/README.md) 之上：设置 coding persona，插入宿主行（API 网关、workspace、投影缓存、存储、原生目录选择器）以及与 [`dsh-web-app`](../web-app/README.md) 相同的浏览器插件名录外加原生 directory-flow 占用者，并挂载本包的 `desktop-runtime` 粘合插件（配置为 `{surfaceContext}`）。该插件通过 `@deepseek-ai/dsh-web-frontend` 的 exports 解析已构建的前端 dist，将其作为 `desktopRuntime` 提供给 Electron `dsh:` 协议处理器，并在 `surfaceContext` 为 true 时注册 Harness 源码与桌面表层提示词段落。它不挂载 webserver、不打印 URL，也不发布 `DSH_WEB_URL`。自适应目录选择器会注入 `webServer`，因此本组合包不挂载它。不在 `dsh-base` 中的随附 agent-preset 插件（`dsh-persona`、`dsh-tool-ask-user`、`dsh-tool-cordis`、`dsh-agent-tool-presentation`）在此声明，以便 `healProfilesModuleFallback` 能从本应用的依赖图解析它们。[`apps/desktop`](../../../apps/desktop/README.md) 中的 Electron 应用启动该 profile，并通过该协议提供 RPC 与客户端 bundle。

## 模型体验

### Harness 源码与桌面表层上下文

#### 模型看到的内容

当 `surfaceContext` 为 true 时，`harness:source` 段落标明磁盘上的 Harness 实现，但不会声称它就是工作目录；全局段落 `app:desktop-surface`（顺序 −98）则向模型说明桌面应用：「this window」指代什么、进程不监听 TCP 端口，以及不要启动替代服务器的指令。当它为 false 时，这两个段落都不会注册。

#### Token 影响

每个会话一行源码说明和一段提示词；每个进程内保持恒定。

#### KV Cache 影响

该提示词段落位于系统提示词靠前位置，且在进程整个生命周期内稳定，因此不会使跨轮次缓存失效。

## 已知限制与延期工作

- **前端 dist 必须已构建**：对 dist 的 `require.resolve` 在激活时明确报错并给出构建提示；没有从源码直接服务的回退路径。
- **没有 HTTP 局域网访问**：本组合包不绑定端口；远程浏览器访问仍使用 `dsh web`。
