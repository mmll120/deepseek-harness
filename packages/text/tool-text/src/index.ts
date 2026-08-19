/**
 * Model-facing `text_stats` tool: pure, stateless text measurements. Registers exactly one tool on
 * `ctx.tools`; the computation touches no session, agent, file, or clock, so the plugin is a plain
 * function plugin with no Config and no dependency beyond the tool registry.
 * @module @deepseek-ai/dsh-tool-text
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-text'
export const inject = ['tools']

/**
 * Measure the UTF-8 byte length of a string.
 * @param text - the string to measure.
 * @returns the number of UTF-8 bytes the string encodes to.
 */
function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Compute the five text_stats counters for one input.
 * @param text - the text to measure.
 * @returns the canonical counters: `lines` counts newline-separated segments (empty text is one
 * line), `words` counts whitespace-delimited tokens of the trimmed input (empty or whitespace-only
 * text is zero), `chars` is the UTF-16 code-unit length, `nonWhitespaceChars` counts characters
 * outside the Unicode `\s` class, and `bytes` is the UTF-8 byte length.
 */
function computeTextStats(text: string): {
  lines: number
  words: number
  chars: number
  nonWhitespaceChars: number
  bytes: number
} {
  const trimmed = text.trim()
  return {
    lines: text.split('\n').length,
    words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    chars: text.length,
    nonWhitespaceChars: text.replace(/\s/g, '').length,
    bytes: utf8Bytes(text),
  }
}

/**
 * Register the `text_stats` tool on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'text_stats',
    description: 'Compute line, word, character, non-whitespace, and UTF-8 byte counts of a text value.',
    parameters: {
      text: { type: 'string', required: true, description: 'The text to measure.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          lines: { type: 'integer', required: true },
          words: { type: 'integer', required: true },
          chars: { type: 'integer', required: true },
          nonWhitespaceChars: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${value.lines} lines, ${value.words} words, ${value.chars} chars `
          + `(${value.nonWhitespaceChars} non-whitespace), ${value.bytes} bytes.`,
      }],
    },
    execute(args) {
      return Promise.resolve(computeTextStats(args.text))
    },
  }))
}
