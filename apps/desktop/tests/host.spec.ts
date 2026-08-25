/** Packed vs source resolution of the shipped agent-preset directory. */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveShippedPresetRoot } from '../src/host.ts'
import { collectInstallFallbackLinks } from '@deepseek-ai/dsh-app-boot'

const SOURCE_PRESETS = fileURLToPath(new URL('../../cli/config/agent-presets/', import.meta.url))

let staged: string | undefined
const processWithResources = process as { resourcesPath?: string }
const previousResources = processWithResources.resourcesPath

afterEach(() => {
  if (previousResources === undefined) delete processWithResources.resourcesPath
  else processWithResources.resourcesPath = previousResources
  if (staged !== undefined) rmSync(staged, { recursive: true, force: true })
  staged = undefined
})

describe('resolveShippedPresetRoot', () => {
  it('uses the CLI config directory when no packed extraResources tree exists', () => {
    delete processWithResources.resourcesPath
    expect(resolveShippedPresetRoot()).toBe(SOURCE_PRESETS)
  })

  it('prefers process.resourcesPath/agent-presets when that directory exists', () => {
    staged = mkdtempSync(join(tmpdir(), 'dsh-desktop-resources-'))
    const packed = join(staged, 'agent-presets')
    mkdirSync(packed)
    processWithResources.resourcesPath = staged
    expect(resolveShippedPresetRoot()).toBe(packed)
  })
})

describe('electron-builder production tree', () => {
  it('declares every Host Service Definition peer as a production dependency', () => {
    const anchor = fileURLToPath(new URL('../package.json', import.meta.url))
    const heal = collectInstallFallbackLinks(anchor)
    const packed = collectInstallFallbackLinks(anchor, { includePeers: false })
    // electron-builder omits peerDependencies. Web-only peers stay off this
    // app; third-party peers ride with the packages that depend on them.
    const webOnly = new Set([
      '@deepseek-ai/dsh-client-hmr',
      '@deepseek-ai/dsh-client-ui-directory-picker-browse',
      '@deepseek-ai/dsh-host-directory-picker-auto',
      '@deepseek-ai/dsh-host-directory-picker-browse',
      '@deepseek-ai/dsh-host-frontend-static',
      '@deepseek-ai/dsh-host-webserver',
      '@deepseek-ai/dsh-web-app',
    ])
    const missing = [...heal.keys()].filter(name =>
      name.startsWith('@deepseek-ai/dsh-')
      && !packed.has(name)
      && !webOnly.has(name),
    ).sort()
    expect(missing, missing.join('\n')).toEqual([])
  })
})
