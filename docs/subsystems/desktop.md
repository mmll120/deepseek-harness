# Desktop

English | [中文](desktop.zh.md)

The desktop subsystem is the Electron application shell over the Harness core. The main process in [`apps/desktop`](../../apps/desktop/README.md) boots the `desktop` profile (`dsh-base` plus the [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md) patch layer) and serves the existing Web GUI over the privileged `dsh:` protocol instead of an HTTP port. The bundle's glue plugin resolves the built frontend dist and provides it as `desktopRuntime` for the protocol handler; no webserver is mounted, no URL is printed, and `DSH_WEB_URL` is never published. The model-visible `app:desktop-surface` prompt section orients sessions to the desktop application — the "this window" referent, the absence of a TCP port, the instruction not to start replacement servers — when `surfaceContext` is true. Session data stays in `$DSH_HOME`, shared with `dsh web`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktopruntime--desktopruntimevalues"></a>

### `ctx.desktopRuntime` — `DesktopRuntimeValues`

Dist location published for the Electron custom-protocol handler.

Source: [`packages/bundle/desktop-app/src/index.ts:48`](../../packages/bundle/desktop-app/src/index.ts)
<!-- END GENERATED cordis-surface -->
