# 桌面（Desktop）

[English](desktop.md) | 中文

桌面子系统是构建在 Harness 核心之上的 Electron 应用外壳。[`apps/desktop`](../../apps/desktop/README.md) 中的主进程启动 `desktop` profile（`dsh-base` 加上 [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md) patch 层），并通过特权 `dsh:` 协议提供现有 Web GUI,而不是使用 HTTP 端口。该 bundle 的胶水插件解析构建后的前端 dist,并将其作为 `desktopRuntime` 提供给协议处理器;不挂载 webserver、不打印 URL,也绝不发布 `DSH_WEB_URL`。当 `surfaceContext` 为 true 时,面向模型的 `app:desktop-surface` 提示区会把会话导向桌面应用——"这个窗口"的指代、没有 TCP 端口、不要启动替代服务器。会话数据存放在 `$DSH_HOME`,与 `dsh web` 共享。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktopruntime--desktopruntimevalues"></a>

### `ctx.desktopRuntime` — `DesktopRuntimeValues`

Dist location published for the Electron custom-protocol handler.

Source: [`packages/bundle/desktop-app/src/index.ts:48`](../../packages/bundle/desktop-app/src/index.ts)
<!-- END GENERATED cordis-surface -->
