# `@deepseek-ai/dsh-desktop-app`

English | [中文](README.zh.md)

The dsh desktop-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md): it sets the coding persona, inserts the Host rows (API gateway, workspace, projection cache, storage, native directory picker) and the same browser plugin roster as [`dsh-web-app`](../web-app/README.md) plus the native directory-flow occupant, and mounts this package's `desktop-runtime` glue plugin (config `{surfaceContext}`). That plugin resolves the built frontend dist through `@deepseek-ai/dsh-web-frontend`'s exports, provides it as `desktopRuntime` for the Electron `dsh:` protocol handler, and registers the harness-source and desktop-surface prompt sections when `surfaceContext` is true. It does not mount a webserver, print a URL, or publish `DSH_WEB_URL`. The auto directory-picker chooser is omitted because it injects `webServer`. Shipped agent-preset plugins that are not in `dsh-base` (`dsh-persona`, `dsh-tool-ask-user`, `dsh-tool-cordis`, `dsh-agent-tool-presentation`) are declared here so `healProfilesModuleFallback` can resolve them from this app's dependency graph. The Electron application in [`apps/desktop`](../../../apps/desktop/README.md) boots this profile and serves RPC plus client bundles over that protocol.

## Model Experience

### Harness-source and desktop-surface context

#### What the model sees

When `surfaceContext` is true, the `harness:source` section identifies the on-disk Harness implementation without claiming it is the working directory, and the `app:desktop-surface` global section (order −98) orients the model to the desktop application: the "this window" referent, the absence of a TCP port, and the instruction not to start replacement servers. When it is false, neither section is registered.

#### Token effect

One source line and one prompt paragraph per session; constant per process.

#### KV Cache effect

The prompt section sits near the system prompt's head and is stable for the life of the process, so it does not invalidate the cache across turns.

## Known Limitations and Deferred Work

- **The frontend dist must be built** — `require.resolve` of the dist fails loud at activation with a build hint; there is no source-serving fallback.
- **No HTTP LAN access** — this bundle does not bind a port; remote browser access remains `dsh web`.
