/**
 * @deepseek-ai/dsh-desktop-app — the Electron-surface bundle's runtime glue
 * plugin plus the bundle patch (`cordis.patch.yml`, declared by the
 * `dsh.bundle.patch` manifest field). The plugin resolves the built frontend
 * dist (workspace knowledge of this bundle, never user config), provides
 * `desktopRuntime` for the Electron protocol handler, and registers the
 * harness-source and desktop-surface prompt sections. There is no HTTP
 * server, LAN trust list, or URL line.
 * @module @deepseek-ai/dsh-desktop-app
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { addHarnessSourceSection } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Stable Cordis plugin name. */
export const name = 'desktop-app'

/** This dsh installation's root, from either this package's source or built entry. */
const SOURCE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))

/** Runtime service that publishes the served frontend dist to the Electron protocol. */
const DESKTOP_RUNTIME_SERVICE = 'desktopRuntime'

/** No required services: the protocol handler reads this plugin's provided values. */
export const inject: string[] = []

/** Plugin config: composed deployment settings. */
export interface Config {
  /**
   * Register the model-visible surface context (the `app:desktop-surface`
   * prompt section). A one-shot non-interactive layer can turn it off when
   * its user is not in the GUI, so the orientation text would be false.
   */
  surfaceContext: boolean
}

export const Config: z<Config> = z.object({
  surfaceContext: z.boolean().default(true),
})

/** Dist location published for the Electron custom-protocol handler. */
export interface DesktopRuntimeValues {
  /** Absolute path of index.html inside the dist root. */
  distIndex: string
  /** Absolute dist root directory (parent of {@link distIndex}). */
  distRoot: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Frontend dist location for the Electron `dsh:` protocol handler. */
    desktopRuntime: DesktopRuntimeValues
  }
}

/** Model-visible orientation for sessions created through the desktop app. */
function desktopSurfacePrompt(): string {
  return 'You are interacting with the user through the DeepSeek Harness desktop application. '
    + 'When the user refers to "this window", "this GUI", or "this app" without naming another target, they mean this desktop application. '
    + 'The renderer provides no implicit DOM, route, or screenshot context. '
    + 'This process does not listen on a TCP port; RPC uses the privileged dsh: protocol inside this application. '
    + 'Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.'
}

/** Dist location is workspace knowledge of this bundle: resolved through the frontend package exports, not configured. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')
  } catch {
    /* v8 ignore next 2 -- reachable only on a checkout without a built dist; the test tree builds it */
    throw new Error('desktop-app: frontend dist not built; run pnpm run build from the repository root first')
  }
}

/** Test hook: hosts with no built frontend dist substitute the resolver; production never touches this. */
export const internals: { resolveDistIndex: () => string } = { resolveDistIndex }

/**
 * Mount the desktop runtime: dist location and optional surface prompt.
 * @param ctx - plugin context.
 * @param config - validated {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  const distIndex = internals.resolveDistIndex()
  ctx.provide(DESKTOP_RUNTIME_SERVICE, { distIndex, distRoot: dirname(distIndex) })
  if (!config.surfaceContext) return
  ctx.inject(['systemPrompt'], (promptCtx) => {
    addHarnessSourceSection(promptCtx, SOURCE_ROOT)
    promptCtx.systemPrompt.section({
      name: 'app:desktop-surface',
      order: -98,
      text: () => desktopSurfacePrompt(),
    })
  })
}
