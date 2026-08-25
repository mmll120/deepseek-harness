# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Harness 的 Electron 桌面应用。主进程启动 `desktop` profile（`dsh-base` + [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.zh.md)），并通过特权 `dsh:` 协议提供现有 Web GUI。进程不监听 HTTP 端口，也不挂载 [`dsh-host-webserver`](../../packages/host/webserver/README.zh.md)。

在已构建的 checkout 上用 `pnpm --filter @deepseek-ai/dsh-desktop start` 启动，或在 `pnpm run build` 之后运行 `dsh desktop`。`--smoke` 会探测 `host.describe` 与 `session.create` 然后退出。会话数据仍写在 `$DSH_HOME`（默认 `~/.dsh`），与 `dsh web` 共用。

`pnpm --filter @deepseek-ai/dsh-desktop run dist` 用 electron-builder 打 Windows NSIS 与 portable 包。应用目录不打进 asar（`asar: false`），这样 Windows 目录联接和原生 addon 才能解析；打包 extraResources 随附 `apps/cli/config/agent-presets`。第一版打包假定工作区已构建安装；macOS dmg 与 Linux AppImage 使用同一套组装，作为后续目标。不要用 `pnpm pack`：那是 npm tarball 命令，不会调用 electron-builder。

## 已知限制与延期工作

- **electron-builder 只打包生产 `dependencies`** — 仅声明为 peer 的包不会进入安装包。因此本应用依赖 `cordis-plugin-group`、`dsh-invariants`、`dsh-system-prompt`，以及 Host 会 import 的 Service Definition peer（`dsh-scope`、`dsh-timeout` 等），打包后的主进程才能启动。在 `run dist` 之前请关闭正在运行的 `DeepSeek Harness.exe`；Windows 会锁住 `release/win-unpacked`。
- **打包后的应用目录不是 asar 归档。** `$DSH_HOME/profiles/node_modules` 用 Windows 目录联接做 heal，无法指向 `app.asar` 内部路径；asar 布局会让 Host 加载插件失败且不出现窗口。
- **打包后的 Electron 不热重载 `cordis.patch.yml`。** patch 文件仍在启动时应用。配置 HMR 属于开发工作流，因此打包后的主进程显式关闭它，尽管 Loader internals 仍可通过随包分发的 `node-addon-require-builtin` 访问。
- **本版本不含自动更新、代码签名或商店上架。** 单实例、托盘以及 Electron 原生目录对话框属于后续产品行为。
