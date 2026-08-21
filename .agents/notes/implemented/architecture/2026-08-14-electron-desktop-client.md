# Agent Note: Electron desktop client over the privileged dsh: protocol

Status: implemented

English | [中文](2026-08-14-electron-desktop-client.zh.md)

## Problem

The product already ships a local Host plus a browser GUI (`dsh web`). A desktop application that wraps that HTTP server in an Electron window would add a listening port, a LAN URL, and a trust fence that Electron does not need, and it would contradict the existing rule that Electron does not reuse [`dsh-host-webserver`](../../../../packages/host/webserver/README.md). Rewriting `packages/client/ui-*` for a second UI family would split Host/Client capability packages by application.

## Decision

The desktop application is a third app assembly beside Web and headless: [`apps/desktop`](../../../../apps/desktop/README.md) plus [`dsh-desktop-app`](../../../../packages/bundle/desktop-app/README.md). The main process boots the `desktop` profile (`dsh-base` + `dsh-desktop-app`) and obtains `connection.apiFetch` without mounting a webserver. The renderer loads the existing Web GUI at `dsh://app/` with `nodeIntegration: false` and `contextIsolation: true`; the profile includes `dsh-client-ui-renderer`, whose `uiRenderer` service replaces the boot page after every client entry activates. The bundle pins [`directory-picker-native`](../../../../packages/host/directory-picker-native/README.md) and its client surface; the auto chooser injects `webServer` to sample bind host and is a Web-only adapter.

`protocol.registerSchemesAsPrivileged` runs before `app.ready` (`standard`, `secure`, `supportFetchAPI`, `corsEnabled`, `stream`). `protocol.handle('dsh', …)` dispatches `/api` to `apiFetch`, reads `/plugins/<id>/client.js` from the client-module table, and delegates frontend-index transformation to `clientModules.injectBootManifest()`. That shared Web/Desktop transform installs the `window.__ModuleLoader__` queue facade, parser-blocking modules and runtime preloads, and `window.__DSH_BOOT__` before the shell module runs. Renderer `location.origin` is `dsh://app`, so `AbstractApiClient.resolveBase()` and `fetch` stay same-origin.

The protocol rewrites each API request to `http://127.0.0.1` (Host and Origin included) before `apiFetch`, because privileged RPCs (`host.pickDirectory`, settings, credentials) require loopback. Shared `apiFetch` does not return 426 for GET `/api/events.mux` or `/api/events.host`; those GETs keep `toFetchHandler`'s SSE body. HTTP 426 and WebSocket upgrades remain only on the webserver route.

`ElectronApiClient` subclasses `AbstractApiClient` and implements only `doFetch` via `globalThis.fetch`. The connection browser plugin selects it when `location.protocol === 'dsh:'` and treats that origin as loopback for native path-open UI. `dsh desktop` spawns Electron; `dsh --profile desktop --dump-config` still dumps the tree without a window.

User data stays in `$DSH_HOME`. electron-builder targets Windows NSIS and portable first and packs the app directory unpacked (`asar: false`) so `$DSH_HOME/profiles/node_modules` Windows junctions and native addons resolve to real directories. Packed extraResources copy `apps/cli/config/agent-presets` to `resources/agent-presets`; source launch keeps that CLI path so the desktop app does not depend on `@deepseek-ai/dsh`. A boot failure after `app.ready` shows `dialog.showErrorBox` because a GUI-subsystem exe has no console (`--smoke` skips the dialog). Config-file HMR is a dev workflow: the main process opts out when `app.isPackaged` is set, even though Loader internals stay reachable through the shipped `node-addon-require-builtin`, and patch files still apply at startup. The desktop app depends on `cordis-plugin-group`, `dsh-invariants`, `dsh-system-prompt`, and the Service Definition peers the Host imports, because electron-builder omits peer-only packages and `boot()` imports the group builtin. This note owns desktop assembly, the privileged-protocol carrier, and the decision not to reuse the webserver. [GUI layering and RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md) owns the fetch subclass table and Host/Client split.

## Verification

Connection tests select `ElectronApiClient` on `dsh:`, keep HTTP 426 on the webserver route, and expose `apiFetch` without a webServer. Module tests compose the boot graph without HTTP and pin facade/preload/graph ordering. Desktop-app tests pin dist publication and the `app:desktop-surface` prompt. Protocol tests rewrite to loopback, serve `/api`, `/plugins`, and the transformed dist index, and reject traversal. Host tests pin packed `resources/agent-presets` over the CLI config fallback. `boot()` appends every AggregateError member, not only `.cause`. The keyless host smoke boots the shipped desktop profile after a build, requires the `dsh-client-ui-renderer` graph row, exercises `host.describe` plus `session.create` through `apiFetch`, and verifies that the desktop index carries the shared module-loader facade, modules preload, and graph. `dsh desktop` argument parsing is covered in the CLI args suite; the built CLI dump pins the desktop profile without a webserver.

## Alternatives considered

### Why not spawn `dsh web` inside Electron?

A localhost wrapper would keep a listening port, LAN URL printing, and the webserver trust fence. The layering note already forbids Electron from reusing `dsh-host-webserver`.

### Why not Tauri?

The Host is a Node/Cordis tree. Electron's main process is Node and matches the package model. Tauri would add a Node sidecar and fight the existing `doFetch` / protocol reservation.

### Why not a separate `packages/client-*` family for Electron?

Host/Client capability packages are shared; applications assemble in `apps/`. A second UI package family would duplicate slots, stores, and tools.

### Why not raw `file://` plus IPC invoke?

`file://` has an opaque origin, breaks `resolveBase()`, and fails the Host/Origin trust fence. A privileged custom protocol keeps fetch/SSE and a real origin. IPC invoke would reimplement the Fetch handler the protocol already forwards.

## Consequences

`dsh desktop` and the packaged `.exe` run the same GUI as `dsh web` with zero ports. Privileged RPCs work because the protocol impersonates loopback. Volume is larger than `dsh web` by Chromium plus the Node tree. An asar archive would make Windows junctions into `$DSH_HOME/profiles/node_modules` point at a file, so the packed Host cannot load plugins; the unpacked app directory is the packaging contract that keeps heal and native addons on a real filesystem. First-cut packaging expects a built workspace; auto-update, signing, and store listing are later product behavior.
