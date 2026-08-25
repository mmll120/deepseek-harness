import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as ToolTextInvariant from '@deepseek-ai/dsh-tool-text/invariant'

describe('dsh-tool-text invariant companion', () => {
  it('mounts and reserves its package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(ToolTextInvariant)
    // A second registration of the same package name fails loud.
    await expect(ctx.plugin(ToolTextInvariant).then(() => undefined)).rejects.toThrow(/already registered/)
  })

  it('disposing the fiber releases the reservation', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(ToolTextInvariant)
    await fiber
    await fiber.dispose()
    await expect(ctx.plugin(ToolTextInvariant)).resolves.toBeDefined()
  })
})
