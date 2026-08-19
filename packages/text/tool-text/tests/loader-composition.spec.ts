// Proves the tool registers through the real Loader from a cordis.yml
// composition: the plugin row needs no config, and the loaded tree executes
// the registered tool end to end.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolText from '@deepseek-ai/dsh-tool-text'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot a cordis.yml mounting system-prompt, tools, and the tool-text row. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-text-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-tool-text'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-text', ToolText],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('dsh-tool-text real Loader composition through cordis.yml', () => {
  it('registers text_stats with no config and executes through the loaded tree', async () => {
    const ctx = await boot()
    expect(ctx.tools.schemas().some(s => s.name === 'text_stats')).toBe(true)

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('loader'),
      name: 'text_stats',
      arguments: { text: 'a b\nc' },
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected text_stats success')
    expect(result.value).toEqual({ lines: 2, words: 3, chars: 5, nonWhitespaceChars: 3, bytes: 5 })
  }, 30_000)
})
