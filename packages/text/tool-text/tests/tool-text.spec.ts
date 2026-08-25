// Drives the REAL plugin body: mounts `dsh-tool-text` on a real `ToolRuntime`
// and invokes the registered `text_stats` tool through `ctx.tools.execute`.
// The tool is stateless, so no agent or session stand-in is needed.
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import * as tool from '../src/index.ts'

const testToolSignal = new AbortController().signal

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(tool)
  return ctx
}

let callCounter = 0
function callStats(ctx: Context, text: string) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'text_stats',
    arguments: { text },
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

describe('dsh-tool-text', () => {
  it('registers a text_stats tool whose schema takes one required text string', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'text_stats')
    expect(schema).toBeDefined()
    const params = schema!.parameters as { properties?: Record<string, unknown>; required?: string[] }
    const props = params.properties ?? {}
    expect(Object.keys(props)).toEqual(['text'])
    expect(props.text).toEqual({ type: 'string', description: 'The text to measure.' })
    expect(params.required).toEqual(['text'])
  })

  it('disposes its registration with the owning fiber (unregister on reload)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = ctx.plugin(tool)
    await fiber
    expect(ctx.tools.schemas().some(s => s.name === 'text_stats')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'text_stats')).toBe(false)
  })

  it('measures a plain multi-line text and renders the summary', async () => {
    const ctx = await setup()
    const result = await callStats(ctx, 'one two\nthree')
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected text_stats success')
    expect(result.value).toEqual({
      lines: 2,
      words: 3,
      chars: 13,
      nonWhitespaceChars: 11,
      bytes: 13,
    })
    expect(text(result)).toBe('2 lines, 3 words, 13 chars (11 non-whitespace), 13 bytes.')
  })

  it('counts empty and whitespace-only text as zero words', async () => {
    const ctx = await setup()
    for (const value of ['', '   \n\t ']) {
      const result = await callStats(ctx, value)
      expect(result.isError).toBe(false)
      if (result.isError) throw new Error('expected text_stats success')
      expect((result.value as { words: number }).words).toBe(0)
    }
  })

  it('counts multibyte UTF-8 bytes and non-whitespace characters', async () => {
    const ctx = await setup()
    const result = await callStats(ctx, 'héllo 中文')
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected text_stats success')
    expect(result.value).toEqual({
      lines: 1,
      words: 2,
      chars: 8,
      nonWhitespaceChars: 7,
      bytes: 13,
    })
  })
})
