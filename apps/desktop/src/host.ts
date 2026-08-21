/**
 * Electron-free desktop Host boot: the same profile stack as `dsh --profile
 * desktop`, anchored on this app's package.json so healProfilesModuleFallback
 * never walks through `@deepseek-ai/dsh`.
 * @module @deepseek-ai/dsh-desktop/host
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  watchUserPatches,
  type Profile,
} from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { DSH_LAUNCH_ENVIRONMENT_KEY, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import type { DesktopRuntimeValues } from '@deepseek-ai/dsh-desktop-app'
import type {} from '@deepseek-ai/dsh-desktop-app'
import type {} from '@deepseek-ai/cordis-plugin-timer'
import type {} from '@deepseek-ai/cordis-plugin-hmr'

const NAME = 'dsh-desktop'
const PROFILE_NAME = 'desktop'
const TELEMETRY_ROW_ID = 'session-telemetry-otel'
const PROFILE_ROOT_FILENAME = 'cordis.yml'
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
`

/** Absolute path of this desktop installation's package.json. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/**
 * Shipped agent-preset root. A packed Electron app copies the YAML tree to
 * `process.resourcesPath/agent-presets`; source and `pnpm start` keep the CLI
 * config directory so this module does not depend on `@deepseek-ai/dsh`.
 * @returns an absolute directory that exists in the current layout.
 */
export function resolveShippedPresetRoot(): string {
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath
  if (resourcesPath !== undefined) {
    const packed = join(resourcesPath, 'agent-presets')
    if (existsSync(packed)) return packed
  }
  return fileURLToPath(new URL('../../cli/config/agent-presets/', import.meta.url))
}

/**
 * The home-level user patch layer (`$DSH_HOME/cordis.patch.yml`).
 * @returns the absolute patch-file path.
 */
function homePatchPath(): string {
  return join(resolveDshHome(), PROFILE_PATCH_FILENAME)
}

/**
 * Load the desktop profile: heal the shared module fallback, then rewrite the
 * empty root config so Loader write-back cannot duplicate bundle inserts.
 * @returns the loaded profile.
 */
function prepareDesktopProfile(): Profile {
  healProfilesModuleFallback(INSTALL_ANCHOR)
  const profile = loadProfile(NAME, PROFILE_NAME, INSTALL_ANCHOR)
  writeFileSync(join(profile.dir, PROFILE_ROOT_FILENAME), PROFILE_ROOT_CONFIG)
  return profile
}

interface ComposedProfile {
  profile: Profile
  bundlePatches: PatchOptions[]
  homePatches: PatchOptions[]
  overlays: PatchOptions[]
}

function composeDesktopProfile(patchFiles: readonly string[]): ComposedProfile {
  const profile = prepareDesktopProfile()
  const homePatches = loadOptionalPatches(NAME, homePatchPath()) ?? []
  const overlays = patchFiles.flatMap(file => loadOverlayPatches(NAME, resolve(file)))
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const rows = new Map<string, EntryOptions>()
  for (const row of composeEntries([bundlePatches, profile.patches, homePatches, overlays])) {
    if (typeof row.id === 'string') rows.set(row.id, row)
  }
  const composedOverlays = [...overlays]
  if (rows.has('agent-presets')) {
    composedOverlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}) as Record<string, unknown>,
        roots: [{ path: resolveShippedPresetRoot(), trust: 'system' }],
      },
    })
  }
  if ((process.env.DSH_TELEMETRY_DISABLED ?? '') !== '' && rows.has(TELEMETRY_ROW_ID)) {
    composedOverlays.push({ id: TELEMETRY_ROW_ID, disabled: true })
  }
  return { profile, bundlePatches, homePatches, overlays: composedOverlays }
}

function allPatches(composed: ComposedProfile): PatchOptions[] {
  return [
    ...composed.bundlePatches,
    ...composed.profile.patches,
    ...composed.homePatches,
    ...composed.overlays,
  ]
}

/** Shared `/api` Fetch handler used by the protocol and the Host probe. */
interface DesktopApiFetch {
  fetch(request: Request): Promise<Response>
}

/** Client bundle table the protocol reads without importing the client package. */
interface DesktopClientModules {
  clientPath(id: string): string | undefined
  graph(): { entries: readonly { id: string }[] }
  injectBootManifest(html: string): string
}

/** Connection handle slice the protocol and probe need. */
interface DesktopConnection {
  apiFetch: DesktopApiFetch
}

/** Booted desktop Host plus the services the protocol handler needs. */
export interface DesktopHost {
  /** Settled root context. */
  ctx: Context
  /** Frontend dist location. */
  desktopRuntime: DesktopRuntimeValues
  /** Shared `/api` Fetch handler. */
  connection: DesktopConnection
  /** Client bundle table. */
  clientModules: DesktopClientModules
  /** Dispose the tree. */
  dispose: () => Promise<void>
}

/** Options for {@link bootDesktopHost}. */
export interface BootDesktopHostOptions {
  /** Frozen launch-environment snapshot. */
  environment: LaunchEnvironmentSnapshot
  /**
   * True when running from a packaged Electron build (`app.isPackaged`).
   * Live config HMR is a dev workflow; the packed process applies patch
   * files at startup only.
   */
  packed?: boolean
  /** Extra `--patch` overlay paths, in argv order. */
  patchFiles?: readonly string[]
}

/**
 * Boot the desktop profile and return the Host services the protocol needs.
 * @param options - environment snapshot, packed flag, and optional overlay patches.
 * @returns the settled Host.
 */
export async function bootDesktopHost(options: BootDesktopHostOptions): Promise<DesktopHost> {
  const composed = composeDesktopProfile(options.patchFiles ?? [])
  const app: { current?: Context } = {}
  const rootConfig = join(composed.profile.dir, PROFILE_ROOT_FILENAME)
  const composeLive = (): PatchOptions[] => structuredClone([
    ...composed.bundlePatches,
    ...loadOptionalPatches(NAME, composed.profile.patchPath) ?? [],
    ...loadOptionalPatches(NAME, homePatchPath()) ?? [],
    ...composed.overlays,
  ])
  const ctx = await boot(NAME, rootConfig, structuredClone(allPatches(composed)), (hostCtx) => {
    app.current = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, options.environment)
  })
  app.current = ctx
  // Live config HMR is a dev workflow. The packed app opts out explicitly:
  // `node-addon-require-builtin` ships with the app, so Loader internals stay
  // reachable and would otherwise enable HMR, whose init reads
  // `process.argv[1]` — absent in a packaged Electron launch. Patch files
  // still apply at startup.
  if (!options.packed && ctx.fiber.state === FiberState.ACTIVE && ctx.get('loader') !== undefined) {
    const loaderInternals = (ctx.get('loader') as { internal?: unknown } | undefined)?.internal
    if (loaderInternals !== undefined) {
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) {
          await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
        }
        await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-hmr', config: { root: [] } })
      }
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: composed.profile.patchPath,
        compose: composeLive,
      })
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: homePatchPath(),
        compose: composeLive,
      })
    }
  }
  const desktopRuntime = ctx.get('desktopRuntime')
  const connection = (ctx as Context & { get(name: string): unknown }).get('connection') as DesktopConnection | undefined
  const clientModules = (ctx as Context & { get(name: string): unknown }).get('clientModules') as DesktopClientModules | undefined
  if (desktopRuntime === undefined || connection === undefined || clientModules === undefined) {
    await ctx.fiber.dispose()
    throw new Error('dsh-desktop: desktopRuntime, connection, or clientModules missing after boot')
  }
  return {
    ctx,
    desktopRuntime,
    connection,
    clientModules,
    dispose: async () => { await ctx.fiber.dispose() },
  }
}

/** Result of the keyless desktop Host probe. */
export interface DesktopHostProbe {
  /** True when both RPCs returned ok. */
  ok: boolean
  /** `host.describe` version when the call succeeded. */
  version?: string
  /** Created session id when `session.create` succeeded. */
  sessionId?: string
  /** Failure text when ok is false. */
  error?: string
}

/**
 * Call `host.describe` and `session.create` through the shared Fetch handler.
 * @param host - booted desktop Host.
 * @param cwd - workspace path passed as `session.create`'s cwd.
 * @returns probe outcome.
 */
export async function probeDesktopHost(host: DesktopHost, cwd: string): Promise<DesktopHostProbe> {
  try {
    const described = await rpc(host.connection.apiFetch, 'host.describe', {})
    if (!described.ok) {
      return { ok: false, error: `host.describe failed: ${JSON.stringify(described)}` }
    }
    const created = await rpc(host.connection.apiFetch, 'session.create', { cwd })
    if (!created.ok) {
      return { ok: false, error: `session.create failed: ${JSON.stringify(created)}` }
    }
    const version = (described.value as { version?: string }).version
    const sessionId = (created.value as { sessionId?: string }).sessionId
    return {
      ok: true,
      ...version === undefined ? {} : { version },
      ...sessionId === undefined ? {} : { sessionId },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function rpc(
  apiFetch: DesktopApiFetch,
  method: string,
  payload: unknown,
): Promise<{ ok: boolean; value?: unknown }> {
  const rpcId = `desktop-probe-${method}`
  const response = await apiFetch.fetch(new Request(`${LOOPBACK_API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload,
    }),
  }))
  if (!response.ok) {
    throw new Error(`${method}: HTTP ${String(response.status)} ${await response.text()}`)
  }
  const body = await response.json() as { result?: { ok: boolean; value?: unknown } }
  return body.result ?? { ok: false }
}

const LOOPBACK_API = 'http://127.0.0.1/api'
