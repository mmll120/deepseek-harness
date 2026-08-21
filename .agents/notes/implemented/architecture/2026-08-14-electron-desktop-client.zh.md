# Agent Note: 通过特权 dsh: 协议组装的 Electron 桌面客户端

Status: implemented

[English](2026-08-14-electron-desktop-client.md) | 中文

## Problem

产品已经提供本地 Host 加浏览器 GUI（`dsh web`）。若桌面应用只是把该 HTTP 服务器套进 Electron 窗口，就会多出一个监听端口、一条 LAN URL，以及 Electron 并不需要的信任栅栏，并且违背「Electron 不复用 [`dsh-host-webserver`](../../../../packages/host/webserver/README.md)」这条已落地约束。为第二套 UI 家族重写 `packages/client/ui-*` 则会按应用拆分 Host/Client 能力包。

## Decision

桌面应用是与 Web、headless 并列的第三种应用组装：[`apps/desktop`](../../../../apps/desktop/README.md) 加上 [`dsh-desktop-app`](../../../../packages/bundle/desktop-app/README.md)。主进程启动 `desktop` profile（`dsh-base` + `dsh-desktop-app`），在不挂载 webserver 的情况下拿到 `connection.apiFetch`。渲染进程在 `dsh://app/` 加载现有 Web GUI，且 `nodeIntegration: false`、`contextIsolation: true`；profile 包含 `dsh-client-ui-renderer`，它提供的 `uiRenderer` 服务会在全部 client entry 激活后替换启动页。组合包钉住 [`directory-picker-native`](../../../../packages/host/directory-picker-native/README.md) 及其客户端表层；自适应选择器会注入 `webServer` 以采样绑定主机，因此只适用于 Web。

`protocol.registerSchemesAsPrivileged` 在 `app.ready` 之前运行（`standard`、`secure`、`supportFetchAPI`、`corsEnabled`、`stream`）。`protocol.handle('dsh', …)` 把 `/api` 交给 `apiFetch`，从 client-module 表读取 `/plugins/<id>/client.js`，并把前端 index 转换委托给 `clientModules.injectBootManifest()`。Web/Desktop 共用的转换会在 shell 模块运行前安装 `window.__ModuleLoader__` 队列 facade、由 HTML parser 阻塞加载的 modules 与 runtime 预加载项，以及 `window.__DSH_BOOT__`。渲染进程的 `location.origin` 为 `dsh://app`，因此 `AbstractApiClient.resolveBase()` 与 `fetch` 仍是同源。

协议在调用 `apiFetch` 之前把每个 API 请求改写为 `http://127.0.0.1`（包括 Host 与 Origin），因为特权 RPC（`host.pickDirectory`、设置、凭据）要求回环。共享的 `apiFetch` 对 GET `/api/events.mux` 或 `/api/events.host` 不返回 426；这些 GET 保留 `toFetchHandler` 的 SSE 响应体。HTTP 426 与 WebSocket upgrade 仍只出现在 webserver 路由上。

`ElectronApiClient` 继承 `AbstractApiClient`，只通过 `globalThis.fetch` 实现 `doFetch`。connection 浏览器插件在 `location.protocol === 'dsh:'` 时选择它，并把该 origin 视为 loopback，以便原生打开路径的 UI 可用。`dsh desktop` 会拉起 Electron；`dsh --profile desktop --dump-config` 仍只转储配置树，不打开窗口。

用户数据仍在 `$DSH_HOME`。electron-builder 首先面向 Windows NSIS 与 portable，并把应用目录打成未打包布局（`asar: false`），这样 `$DSH_HOME/profiles/node_modules` 上的 Windows 目录联接和原生 addon 都能指向真实目录。打包时 extraResources 把 `apps/cli/config/agent-presets` 复制到 `resources/agent-presets`；源码启动仍使用该 CLI 路径，因此桌面应用不依赖 `@deepseek-ai/dsh`。`app.ready` 之后的启动失败会调用 `dialog.showErrorBox`，因为 GUI 子系统 exe 没有控制台（`--smoke` 不弹框）。配置文件 HMR 属于开发工作流：即使 Loader internals 仍可通过随包分发的 `node-addon-require-builtin` 访问，主进程在 `app.isPackaged` 时也会显式关闭它；patch 文件仍在启动时应用。桌面应用依赖 `cordis-plugin-group`、`dsh-invariants`、`dsh-system-prompt`，以及 Host 会 import 的 Service Definition peer，因为 electron-builder 会省略仅 peer 的包，而 `boot()` 会导入 group 内置插件。本笔记负责桌面组装、特权协议载体，以及不复用 webserver 的决定。[GUI 分层与 RPC 协议](2026-07-19-gui-layering-and-rpc-protocol.md) 负责 fetch 子类表和 Host/Client 划分。

## Verification

Connection 测试在 `dsh:` 上选择 `ElectronApiClient`，把 HTTP 426 留在 webserver 路由，并在没有 webServer 时暴露 `apiFetch`。模块测试在没有 HTTP 时组合启动图，并钉住 facade、预加载项和启动图的顺序。desktop-app 测试钉住 dist 发布与 `app:desktop-surface` 提示词。协议测试改写到回环，提供 `/api`、`/plugins` 与转换后的 dist index，并拒绝路径穿越。Host 测试钉住打包后的 `resources/agent-presets` 优先于 CLI 配置回退。`boot()` 会追加 AggregateError 的每一个成员，而不是只走 `.cause`。无密钥宿主冒烟会在构建之后启动随附的 desktop profile，要求存在 `dsh-client-ui-renderer` 启动图行，通过 `apiFetch` 完成 `host.describe` 与 `session.create`，并验证桌面 index 携带共用的 module-loader facade、modules 预加载项和启动图。`dsh desktop` 参数解析由 CLI args 套件覆盖；已构建 CLI 的配置转储钉住不含 webserver 的 desktop profile。

## Alternatives considered

### Why not spawn `dsh web` inside Electron?

localhost 套壳会保留监听端口、LAN URL 打印以及 webserver 信任栅栏。分层笔记已经禁止 Electron 复用 `dsh-host-webserver`。

### Why not Tauri?

Host 是 Node/Cordis 树。Electron 主进程就是 Node，与现有包模型对齐。Tauri 还要再挂一个 Node sidecar，并与已有的 `doFetch` / 协议预留点冲突。

### Why not a separate `packages/client-*` family for Electron?

Host/Client 能力包是共用的；应用只在 `apps/` 里组装。第二套 UI 包家族会重复 slots、store 和工具。

### Why not raw `file://` plus IPC invoke?

`file://` 的 origin 不透明，会破坏 `resolveBase()`，也会无法通过 Host/Origin 信任栅栏。特权自定义协议可以保留 fetch/SSE 和真正的 origin。IPC invoke 会把协议已经转发的 Fetch handler 再实现一遍。

## Consequences

`dsh desktop` 与打包后的 `.exe` 运行与 `dsh web` 相同的 GUI，且零端口。特权 RPC 能工作，是因为协议冒充回环。体积会大于 `dsh web`，这是 Chromium 加 Node 树的固定成本。asar 归档会让 `$DSH_HOME/profiles/node_modules` 上的 Windows 目录联接指向一个文件，打包后的 Host 就无法加载插件；未打包的应用目录是让 heal 与原生 addon 落在真实文件系统上的打包约定。第一版打包假定工作区已构建；自动更新、签名和商店上架属于后续产品行为。
