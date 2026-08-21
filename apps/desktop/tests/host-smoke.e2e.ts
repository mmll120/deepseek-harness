/**
 * Keyless desktop Host smoke: boot the shipped desktop profile and exercise
 * host.describe plus session.create through apiFetch. Skips on a clean tree;
 * the built-bin lane runs it after `pnpm run build`.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { bootDesktopHost, probeDesktopHost } from '../src/host.ts'
import { handleDesktopProtocol } from '../src/protocol.ts'
import { DIST_INDEX } from '../../web/tests/support.ts'

const clientBundle = fileURLToPath(new URL('../../../packages/client/ui-theme/lib/client.js', import.meta.url))
const ready = existsSync(DIST_INDEX) && existsSync(clientBundle)

let home: string | undefined
const previousHome = process.env.DSH_HOME

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (home !== undefined) rmSync(home, { recursive: true, force: true })
  home = undefined
})

describe.skipIf(!ready)('desktop host smoke', () => {
  it('boots without a webServer and answers host.describe plus session.create', async () => {
    home = mkdtempSync(join(tmpdir(), 'dsh-desktop-home-'))
    process.env.DSH_HOME = home
    const workspace = join(home, 'workspace')
    mkdirSync(workspace)
    writeFileSync(join(workspace, 'README.md'), 'desktop smoke\n')
    const values: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) values[key] = value
    }
    const host = await bootDesktopHost({
      environment: createLaunchEnvironmentSnapshot([{ source: 'process', values }]),
    })
    try {
      expect((host.ctx as { get(name: string): unknown }).get('webServer')).toBeUndefined()
      expect(host.desktopRuntime.distIndex).toBe(DIST_INDEX)
      expect(host.clientModules.graph().entries.some(entry => entry.id === '@deepseek-ai/dsh-client-ui-renderer')).toBe(true)
      const probe = await probeDesktopHost(host, workspace)
      expect(probe.ok, probe.error).toBe(true)
      expect(probe.sessionId).toEqual(expect.any(String))
      const protocolDeps = {
        apiFetch: host.connection.apiFetch,
        clientPath: (id: string) => host.clientModules.clientPath(id),
        injectBootManifest: (html: string) => host.clientModules.injectBootManifest(html),
        distIndex: host.desktopRuntime.distIndex,
        distRoot: host.desktopRuntime.distRoot,
      }
      const index = await handleDesktopProtocol(new Request('dsh://app/'), protocolDeps)
      const html = await index.text()
      expect(html).toContain('window.__ModuleLoader__=')
      expect(html).toContain('<script src="/plugins/@deepseek-ai/dsh-client-modules/client.js?rev=')
      expect(html).toContain('window.__DSH_BOOT__ = ')
      const described = await handleDesktopProtocol(new Request('dsh://app/api/host.describe', {
        method: 'POST',
        headers: { origin: 'dsh://app', 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'protocol-describe',
          method: 'host.describe',
          payload: {},
        }),
      }), protocolDeps)
      expect(described.status).toBe(200)
      const body = await described.json() as { result?: { ok: boolean } }
      expect(body.result?.ok).toBe(true)
    } finally {
      await host.dispose()
    }
  }, 120_000)

  it('boots with packed: true without registering config HMR', async () => {
    // The packed Electron app ships node-addon-require-builtin, so Loader
    // internals exist there and HMR would otherwise boot and read
    // `process.argv[1]` (absent on a double-click launch). The vitest runner
    // lacks internals, so this pins the packed contract: the flag must keep
    // the boot free of the hmr service regardless.
    home = mkdtempSync(join(tmpdir(), 'dsh-desktop-home-'))
    process.env.DSH_HOME = home
    const workspace = join(home, 'workspace')
    mkdirSync(workspace)
    const values: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) values[key] = value
    }
    const host = await bootDesktopHost({
      environment: createLaunchEnvironmentSnapshot([{ source: 'process', values }]),
      packed: true,
    })
    try {
      expect((host.ctx as { get(name: string): unknown }).get('hmr')).toBeUndefined()
      expect(host.desktopRuntime.distIndex).toBe(DIST_INDEX)
    } finally {
      await host.dispose()
    }
  }, 120_000)
})
