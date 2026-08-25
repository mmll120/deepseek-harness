# Use the desktop app

English | [中文](desktop.zh.md)

The desktop app is the same DeepSeek Harness GUI as [the Web UI](./index.md), packaged as a local Electron window. It does not listen on a TCP port. Session data, settings, and credentials stay in `$DSH_HOME` (default `~/.dsh`), shared with `dsh web`.

## Start

From a built checkout:

```sh
dsh desktop
```

or `pnpm --filter @deepseek-ai/dsh-desktop start`. The window loads `dsh://app/`. `--smoke` runs `host.describe` and `session.create` then exits, which is the keyless host probe.

Configure a model and choose a workspace the same way as in the Web UI guide.

## How it differs from `dsh web`

The desktop Host reuses the Web plugin roster and API gateway. RPC and client bundles travel on the privileged `dsh:` protocol inside the process, so there is no printed URL, no `--host`/`--port`, and no LAN access. Use `dsh web` when a browser on another machine must reach the Host.

Windows installers (NSIS and portable) come from `pnpm --filter @deepseek-ai/dsh-desktop run dist` after `pnpm run build`. The packed app directory is unpacked so plugin resolution and native addons work. macOS and Linux packages use the same assembly later.

## Continue

- [Use the Web UI](./index.md)
- [Configure models](./providers.md)
- [Use other CLI modes](../../../apps/cli/README.md)
