# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

Electron desktop application for DeepSeek Harness. The main process boots the `desktop` profile (`dsh-base` + [`dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)) and serves the existing Web GUI over the privileged `dsh:` protocol. There is no listening HTTP port and [`dsh-host-webserver`](../../packages/host/webserver/README.md) is not mounted.

Start from a built checkout with `pnpm --filter @deepseek-ai/dsh-desktop start`, or `dsh desktop` after `pnpm run build`. `--smoke` probes `host.describe` and `session.create` then exits. Session data stays in `$DSH_HOME` (default `~/.dsh`), shared with `dsh web`.

`pnpm --filter @deepseek-ai/dsh-desktop run dist` runs electron-builder for Windows NSIS and portable targets. The app directory is unpacked (`asar: false`) so Windows junctions and native addons resolve; packed extraResources ship `apps/cli/config/agent-presets`. First-cut packs expect a built workspace install; macOS dmg and Linux AppImage share this assembly later. Do not use `pnpm pack`: that is the npm tarball command and does not invoke electron-builder.

## Known Limitations and Deferred Work

- **electron-builder packs production `dependencies`** — peer-only packages are omitted. This app therefore depends on `cordis-plugin-group`, `dsh-invariants`, `dsh-system-prompt`, and the Service Definition peers the Host imports (`dsh-scope`, `dsh-timeout`, …) so the packed main process can boot. Close any running `DeepSeek Harness.exe` before `run dist`; Windows locks `release/win-unpacked`.
- **The packed app directory is not an asar archive.** `$DSH_HOME/profiles/node_modules` heals with Windows junctions, which cannot target a path inside `app.asar`; an asar layout makes the Host fail to load plugins with no window.
- **Packed Electron skips live `cordis.patch.yml` reload.** Patch files still apply at startup. Config HMR is a dev workflow, so the packaged main process opts out even though Loader internals stay reachable through the shipped `node-addon-require-builtin`.
- **No auto-update, code signing, or store listing** in this cut. Single-instance, tray, and an Electron-native directory dialog are later product behavior.
