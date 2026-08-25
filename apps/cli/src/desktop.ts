/**
 * Spawn the Electron desktop app. `dsh desktop` must open a window; booting
 * `--profile desktop` inside this Node process would start the Host with no
 * renderer.
 * @module @deepseek-ai/dsh/desktop
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve the Electron binary and the desktop main entry, then spawn them.
 * @param args - arguments forwarded to the Electron process (`--smoke`, ...).
 * @returns the child exit code.
 */
export async function runDesktop(args: readonly string[]): Promise<number> {
  const require = createRequire(import.meta.url)
  let desktopRoot: string
  try {
    desktopRoot = dirname(require.resolve('@deepseek-ai/dsh-desktop/package.json'))
  } catch {
    throw new Error('dsh desktop: @deepseek-ai/dsh-desktop is not installed')
  }
  const desktopRequire = createRequire(join(desktopRoot, 'package.json'))
  const electronBin = desktopRequire('electron') as unknown
  if (typeof electronBin !== 'string') {
    throw new Error('dsh desktop: electron did not export its executable path')
  }
  const built = join(desktopRoot, 'lib', 'main.js')
  const source = fileURLToPath(new URL('../../desktop/src/main.ts', import.meta.url))
  const electronArgs = existsSync(built)
    ? [built, ...args]
    : ['--import', 'tsx/esm', source, ...args]
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(electronBin, electronArgs, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal !== null) resolvePromise(1)
      else resolvePromise(code ?? 1)
    })
  })
}
