/** `dsh desktop` spawns Electron with the desktop main entry. */

import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { runDesktop } from '../src/desktop.ts'

function fakeChild(emit: (child: EventEmitter) => void): EventEmitter {
  const child = new EventEmitter()
  spawnMock.mockImplementation(() => {
    queueMicrotask(() => { emit(child) })
    return child
  })
  return child
}

afterEach(() => { spawnMock.mockReset() })

describe('runDesktop', () => {
  it('spawns Electron with the desktop main entry and forwards args', async () => {
    fakeChild((child) => { child.emit('exit', 0, null) })
    await expect(runDesktop(['--smoke'])).resolves.toBe(0)
    expect(spawnMock).toHaveBeenCalledOnce()
    const [bin, args, options] = spawnMock.mock.calls[0] as [string, string[], { stdio: string }]
    expect(typeof bin).toBe('string')
    expect(bin.length).toBeGreaterThan(0)
    expect(args.at(-1)).toBe('--smoke')
    expect(args.some(arg => arg.endsWith('main.js') || arg.endsWith('main.ts'))).toBe(true)
    expect(options).toEqual({ stdio: 'inherit' })
  })

  it('maps a child signal to exit code 1', async () => {
    fakeChild((child) => { child.emit('exit', null, 'SIGTERM') })
    await expect(runDesktop([])).resolves.toBe(1)
  })

  it('rejects when Electron fails to spawn', async () => {
    fakeChild((child) => { child.emit('error', new Error('spawn electron ENOENT')) })
    await expect(runDesktop([])).rejects.toThrow('ENOENT')
  })
})
