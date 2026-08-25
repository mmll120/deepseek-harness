# 使用桌面应用

[English](desktop.md) | 中文

桌面应用与[Web UI](./index.zh.md)是同一套 DeepSeek Harness GUI，打包成本地 Electron 窗口。它不监听 TCP 端口。会话数据、设置和凭据仍写在 `$DSH_HOME`（默认 `~/.dsh`），与 `dsh web` 共用。

## 启动

在已构建的 checkout 上：

```sh
dsh desktop
```

或运行 `pnpm --filter @deepseek-ai/dsh-desktop start`。窗口加载 `dsh://app/`。`--smoke` 会运行 `host.describe` 与 `session.create` 然后退出，这就是无密钥宿主探测。

配置模型和选择工作区的方式与 Web UI 指南相同。

## 与 `dsh web` 的差异

桌面 Host 复用 Web 插件名录和 API 网关。RPC 与客户端 bundle 走进程内的特权 `dsh:` 协议，因此没有打印的 URL、没有 `--host`/`--port`，也没有局域网访问。需要另一台机器上的浏览器访问 Host 时，使用 `dsh web`。

Windows 安装包（NSIS 与 portable）在 `pnpm run build` 之后通过 `pnpm --filter @deepseek-ai/dsh-desktop run dist` 生成。打包后的应用目录保持未归档，以便插件解析和原生 addon 可用。macOS 与 Linux 包使用同一套组装，作为后续目标。

## 继续使用

- [使用 Web UI](./index.zh.md)
- [配置模型](./providers.zh.md)
- [使用其他 CLI 模式](../../../apps/cli/README.zh.md)
