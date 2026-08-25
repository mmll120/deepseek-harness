/**
 * Privileged `dsh:` protocol dispatcher for the Electron desktop app.
 *
 * Rewrites renderer requests to `http://127.0.0.1` so the Connection trust
 * fence treats them as loopback (privileged RPCs refuse a `dsh://app` Host),
 * then serves `/api` through `connection.apiFetch`, `/plugins` from the
 * client-module table, and the frontend dist with boot-manifest injection.
 * @module @deepseek-ai/dsh-desktop/protocol
 */

import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

/** Custom-scheme name registered with Electron before `app.ready`. */
export const DESKTOP_PROTOCOL_SCHEME = 'dsh'

/** Host of the renderer origin (`dsh://app/`). */
export const DESKTOP_PROTOCOL_HOST = 'app'

/** Loopback origin used after rewrite so privileged RPCs pass the trust fence. */
const LOOPBACK_ORIGIN = 'http://127.0.0.1'

/** Boot graph served as `window.__DSH_BOOT__` (same fields the modules node half composes). */
export interface DesktopBootGraph {
  rev: string
  entries: readonly unknown[]
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

/** Services the protocol handler reads from the booted desktop Host. */
export interface DesktopProtocolDeps {
  /** Shared `/api` Fetch handler (Typert interceptors then API Proxy). */
  apiFetch: { fetch(request: Request): Promise<Response> }
  /**
   * Absolute path of a client bundle.
   * @param id - package name, including a scope slash.
   * @returns the path, or undefined when the id is unknown.
   */
  clientPath: (id: string) => string | undefined
  /** Current `__DSH_BOOT__` graph. */
  graph: () => DesktopBootGraph
  /** Absolute path of index.html inside the dist root. */
  distIndex: string
  /** Absolute dist root directory. */
  distRoot: string
}

/**
 * Inject the boot entry graph into index.html as `window.__DSH_BOOT__`.
 * @param html - the index.html source.
 * @param graph - the composed entry graph.
 * @returns the html with the graph script injected.
 */
export function injectDesktopBootManifest(html: string, graph: DesktopBootGraph): string {
  const json = JSON.stringify(graph).replaceAll('<', '\\u003c')
  const script = `<script>window.__DSH_BOOT__ = ${json}</script>`
  const head = html.indexOf('<head>')
  if (head !== -1) return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`
  return `${script}${html}`
}

/**
 * Clone a renderer request onto `http://127.0.0.1` with matching Host/Origin.
 * @param request - incoming `dsh:` (or already-rewritten) request.
 * @returns a new Request whose trust-fence Host is loopback.
 */
export function rewriteToLoopback(request: Request): Request {
  const url = new URL(request.url)
  const loopback = new URL(`${url.pathname}${url.search}`, LOOPBACK_ORIGIN)
  const headers = new Headers(request.headers)
  headers.set('host', '127.0.0.1')
  if (headers.has('origin')) headers.set('origin', LOOPBACK_ORIGIN)
  const init: RequestInit = {
    method: request.method,
    headers,
    signal: request.signal,
  }
  if (request.body !== null && request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // Node Fetch requires duplex when a streamed body is reused.
    ;(init as RequestInit & { duplex: 'half' }).duplex = 'half'
  }
  return new Request(loopback, init)
}

/**
 * Dispatch one privileged-protocol request.
 * @param request - Electron `protocol.handle` request.
 * @param deps - live Host services and dist location.
 * @returns the Fetch response to return to the renderer.
 */
export async function handleDesktopProtocol(
  request: Request,
  deps: DesktopProtocolDeps,
): Promise<Response> {
  const url = new URL(request.url)
  const pathname = decodeURIComponent(url.pathname)
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return deps.apiFetch.fetch(rewriteToLoopback(request))
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405 })
  }
  if (pathname.startsWith('/plugins/')) {
    return servePlugin(pathname, request.method, deps)
  }
  return serveStatic(pathname, request.method, deps)
}

async function servePlugin(
  pathname: string,
  method: string,
  deps: DesktopProtocolDeps,
): Promise<Response> {
  const prefix = '/plugins/'
  const mapSuffix = '/client.js.map'
  const bundleSuffix = '/client.js'
  const isSourceMap = pathname.endsWith(mapSuffix)
  const suffix = isSourceMap ? mapSuffix : bundleSuffix
  const clientPath = pathname.endsWith(suffix)
    ? deps.clientPath(pathname.slice(prefix.length, -suffix.length))
    : undefined
  const path = clientPath === undefined ? undefined : `${clientPath}${isSourceMap ? '.map' : ''}`
  if (path === undefined) return new Response(null, { status: 404 })
  try {
    const body = await readFile(path)
    return new Response(method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'content-type': isSourceMap ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

async function serveStatic(
  pathname: string,
  method: string,
  deps: DesktopProtocolDeps,
): Promise<Response> {
  const distRoot = resolve(deps.distRoot)
  const distIndex = resolve(deps.distIndex)
  const target = resolve(normalize(join(distRoot, pathname)))
  if (target !== distRoot && !target.startsWith(distRoot + sep)) {
    return new Response(null, { status: 403 })
  }
  const indexResponse = async (): Promise<Response> => {
    const html = injectDesktopBootManifest(await readFile(distIndex, 'utf8'), deps.graph())
    return new Response(method === 'HEAD' ? null : html, {
      status: 200,
      headers: { 'content-type': MIME['.html'] ?? 'text/html; charset=utf-8' },
    })
  }
  if (target === distRoot || target === distIndex) return indexResponse()
  try {
    const body = await readFile(target)
    return new Response(method === 'HEAD' ? null : body, {
      status: 200,
      headers: { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' },
    })
  } catch {
    return indexResponse()
  }
}
