/**
 * Desktop runtime glue: dist resolution through the bundle's own hook, the
 * desktopRuntime service, and the desktop-surface prompt section.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { apply, Config, internals } from '../src/index.ts'

let dist: string | undefined

afterEach(() => {
  internals.resolveDistIndex = originalResolve
  if (dist !== undefined) rmSync(dist, { recursive: true, force: true })
  dist = undefined
})

const originalResolve = internals.resolveDistIndex

/** Stage a dist fixture and point the bundle's resolver at it. */
function stageDist(): string {
  dist = mkdtempSync(join(tmpdir(), 'dsh-desktop-app-'))
  mkdirSync(join(dist, 'dist'))
  const index = join(dist, 'dist', 'index.html')
  writeFileSync(index, '<head></head><body>shell</body>')
  internals.resolveDistIndex = () => index
  return index
}

describe('desktop-app runtime glue', () => {
  it('defaults surfaceContext to true', () => {
    expect(new Config({} as never).surfaceContext).toBe(true)
  })

  it('provides the dist location and registers the desktop-surface prompt', async () => {
    const index = stageDist()
    const ctx = new Context()
    apply(ctx, new Config({ surfaceContext: true }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(ctx.get('desktopRuntime')).toEqual({
      distIndex: index,
      distRoot: join(dist!, 'dist'),
    })
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(entry => entry.name === 'harness:source')?.text)
      .toContain('DeepSeek Harness implementation checkout')
    const section = assembly.sections.find(entry => entry.name === 'app:desktop-surface')
    expect(section?.text).toContain('DeepSeek Harness desktop application')
    expect(section?.text).toContain('does not listen on a TCP port')
    expect(section?.text).not.toContain('DSH_WEB_URL')
  })

  it('omits the surface prompt when surfaceContext is false', async () => {
    stageDist()
    const ctx = new Context()
    apply(ctx, new Config({ surfaceContext: false }))
    await ctx.plugin(SystemPrompt, { persona: '' })
    await new Promise(resolve => setTimeout(resolve, 0))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(entry => entry.name === 'app:desktop-surface')).toBeUndefined()
    expect(assembly.sections.find(entry => entry.name === 'harness:source')).toBeUndefined()
    expect(ctx.get('desktopRuntime')?.distIndex).toBeDefined()
  })

  it('resolves the frontend dist through package exports or fails loud', () => {
    internals.resolveDistIndex = originalResolve
    try {
      const index = originalResolve()
      expect(index).toMatch(/index\.html$/)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/frontend dist not built/)
    }
  })
})
