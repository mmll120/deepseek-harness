/**
 * Electron main process: register the privileged `dsh:` scheme, boot the
 * desktop Host without an HTTP server, and load the renderer at `dsh://app/`.
 * `--smoke` probes `host.describe` and `session.create` then exits.
 * @module @deepseek-ai/dsh-desktop/main
 */

/* v8 ignore file -- Electron lifecycle is exercised by the packaged smoke and protocol unit tests. */

import { join } from 'node:path'
import { app, BrowserWindow, dialog, protocol } from 'electron'
import { loadLayeredEnv, installFailLoud } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { bootDesktopHost, probeDesktopHost } from './host.ts'
import {
  DESKTOP_PROTOCOL_HOST,
  DESKTOP_PROTOCOL_SCHEME,
  handleDesktopProtocol,
} from './protocol.ts'

protocol.registerSchemesAsPrivileged([{
  scheme: DESKTOP_PROTOCOL_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}])

const NAME = 'dsh-desktop'

async function main(): Promise<void> {
  const environment = loadLayeredEnv(NAME)
  app.setPath('userData', join(resolveDshHome(), 'desktop'))
  await app.whenReady()
  const host = await bootDesktopHost({ environment, packed: app.isPackaged })
  installFailLoud(NAME, process, async () => {
    await host.dispose()
  })
  protocol.handle(DESKTOP_PROTOCOL_SCHEME, request => handleDesktopProtocol(request, {
    apiFetch: host.connection.apiFetch,
    clientPath: id => host.clientModules.clientPath(id),
    graph: () => host.clientModules.graph(),
    distIndex: host.desktopRuntime.distIndex,
    distRoot: host.desktopRuntime.distRoot,
  }))

  if (process.argv.includes('--smoke')) {
    const result = await probeDesktopHost(host, process.cwd())
    if (!result.ok) {
      process.stderr.write(`dsh-desktop smoke failed: ${result.error ?? 'unknown error'}\n`)
      await host.dispose()
      app.exit(1)
      return
    }
    process.stdout.write(`dsh-desktop smoke: describe ${result.version ?? '?'} session ${result.sessionId ?? '?'}\n`)
    await host.dispose()
    app.exit(0)
    return
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.on('closed', () => {
    void host.dispose().finally(() => { app.quit() })
  })
  await window.loadURL(`${DESKTOP_PROTOCOL_SCHEME}://${DESKTOP_PROTOCOL_HOST}/`)
}

/**
 * Flatten `.cause` and AggregateError `.errors` for the packed GUI, which has
 * no console. `boot()` already appends inner stacks; this walk covers throws
 * that never pass through `boot()`.
 */
function formatDesktopError(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors.map(formatDesktopError).join('\n')
    return `${error.stack ?? error.message}${inner === '' ? '' : `\n${inner}`}`
  }
  if (error instanceof Error) {
    const nested = error.cause === undefined ? '' : `\n${formatDesktopError(error.cause)}`
    return `${error.stack ?? error.message}${nested}`
  }
  return String(error)
}

void main().catch((error: unknown) => {
  const text = formatDesktopError(error)
  process.stderr.write(`dsh-desktop: ${text}\n`)
  if (app.isReady() && !process.argv.includes('--smoke')) {
    dialog.showErrorBox('DeepSeek Harness failed to start', text.slice(0, 4000))
  }
  app.exit(1)
})
