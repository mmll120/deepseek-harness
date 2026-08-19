/** Privileged-protocol dispatch: loopback rewrite, /api, /plugins, dist. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  handleDesktopProtocol,
  injectDesktopBootManifest,
  rewriteToLoopback,
  type DesktopBootGraph,
  type DesktopProtocolDeps,
} from '../src/protocol.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

function stage(): { distRoot: string; distIndex: string; plugin: string; deps: DesktopProtocolDeps } {
  root = mkdtempSync(join(tmpdir(), 'dsh-desktop-protocol-'))
  const distRoot = join(root, 'dist')
  mkdirSync(distRoot)
  const distIndex = join(distRoot, 'index.html')
  writeFileSync(distIndex, '<head></head><body>shell</body>')
  writeFileSync(join(distRoot, 'app.js'), 'window.__shell = 1\n')
  const plugin = join(root, 'client.js')
  writeFileSync(plugin, 'window.__ModuleLoader__.load({id:"x",factory(){}})\n')
  writeFileSync(`${plugin}.map`, '{"version":3}\n')
  const graph: DesktopBootGraph = { rev: 'abc', entries: [{ id: '@fixture/ui', url: '/plugins/@fixture/ui/client.js?rev=1', rev: '1' }] }
  const seen: string[] = []
  const deps: DesktopProtocolDeps = {
    apiFetch: {
      fetch: async (request) => {
        seen.push(`${request.method} ${request.url} host=${request.headers.get('host')} origin=${request.headers.get('origin')}`)
        if (new URL(request.url).pathname === '/api/events.mux') {
          return new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
        }
        return Response.json({ ok: true })
      },
    },
    clientPath: id => id === '@fixture/ui' ? plugin : undefined,
    graph: () => graph,
    distIndex,
    distRoot,
  }
  Object.assign(deps, { seen })
  return { distRoot, distIndex, plugin, deps }
}

describe('rewriteToLoopback', () => {
  it('rewrites dsh: URL, Host, and Origin onto loopback', () => {
    const rewritten = rewriteToLoopback(new Request('dsh://app/api/host.describe', {
      method: 'POST',
      headers: { origin: 'dsh://app', 'content-type': 'application/json' },
      body: '{"type":"client-request"}',
    }))
    expect(rewritten.url).toBe('http://127.0.0.1/api/host.describe')
    expect(rewritten.headers.get('host')).toBe('127.0.0.1')
    expect(rewritten.headers.get('origin')).toBe('http://127.0.0.1')
  })
})

describe('handleDesktopProtocol', () => {
  it('forwards /api through apiFetch after loopback rewrite, including SSE GETs', async () => {
    const { deps } = stage()
    const unary = await handleDesktopProtocol(new Request('dsh://app/api/host.describe', {
      method: 'POST',
      headers: { origin: 'dsh://app', 'content-type': 'application/json' },
      body: '{}',
    }), deps)
    expect(unary.status).toBe(200)
    const mux = await handleDesktopProtocol(new Request('dsh://app/api/events.mux'), deps)
    expect(mux.status).toBe(200)
    expect(mux.headers.get('content-type')).toContain('text/event-stream')
    const seen = (deps as DesktopProtocolDeps & { seen: string[] }).seen
    expect(seen.some(line => line.includes('http://127.0.0.1/api/host.describe') && line.includes('host=127.0.0.1'))).toBe(true)
    expect(seen.some(line => line.includes('/api/events.mux'))).toBe(true)
  })

  it('serves client bundles and source maps, and 404s unknown plugins', async () => {
    const { deps } = stage()
    const bundle = await handleDesktopProtocol(new Request('dsh://app/plugins/@fixture/ui/client.js'), deps)
    expect(bundle.status).toBe(200)
    expect(await bundle.text()).toContain('__ModuleLoader__')
    const head = await handleDesktopProtocol(new Request('dsh://app/plugins/@fixture/ui/client.js', { method: 'HEAD' }), deps)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    const map = await handleDesktopProtocol(new Request('dsh://app/plugins/@fixture/ui/client.js.map'), deps)
    expect(map.status).toBe(200)
    expect(map.headers.get('content-type')).toContain('application/json')
    const missing = await handleDesktopProtocol(new Request('dsh://app/plugins/@fixture/missing/client.js'), deps)
    expect(missing.status).toBe(404)
    const odd = await handleDesktopProtocol(new Request('dsh://app/plugins/not-a-bundle'), deps)
    expect(odd.status).toBe(404)
  })

  it('injects the boot graph into index.html and serves dist files', async () => {
    const { deps } = stage()
    const index = await handleDesktopProtocol(new Request('dsh://app/'), deps)
    expect(index.status).toBe(200)
    const html = await index.text()
    expect(html).toContain('window.__DSH_BOOT__')
    expect(html).toContain('@fixture/ui')
    expect(html).toBe(injectDesktopBootManifest('<head></head><body>shell</body>', deps.graph()))
    expect(injectDesktopBootManifest('<head></head>', { rev: '<img>', entries: [] })).toContain('\\u003cimg>')
    const asset = await handleDesktopProtocol(new Request('dsh://app/app.js'), deps)
    expect(asset.status).toBe(200)
    expect(await asset.text()).toContain('__shell')
  })

  it('rejects traversal, falls unknown paths back to index, and 405s non-GET static', async () => {
    const { deps } = stage()
    // Encoded slash keeps `..` in the path after WHATWG normalization.
    const traversal = await handleDesktopProtocol(new Request('dsh://app/%2e%2e%2fsecret'), deps)
    expect(traversal.status).toBe(403)
    const spa = await handleDesktopProtocol(new Request('dsh://app/session/abc'), deps)
    expect(spa.status).toBe(200)
    expect(await spa.text()).toContain('window.__DSH_BOOT__')
    const post = await handleDesktopProtocol(new Request('dsh://app/app.js', { method: 'POST' }), deps)
    expect(post.status).toBe(405)
    const head = await handleDesktopProtocol(new Request('dsh://app/', { method: 'HEAD' }), deps)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('prepends the boot script when index.html has no head element', () => {
    expect(injectDesktopBootManifest('<body>x</body>', { rev: '1', entries: [] }))
      .toBe('<script>window.__DSH_BOOT__ = {"rev":"1","entries":[]}</script><body>x</body>')
  })

  it('returns 404 when a registered plugin file is unreadable', async () => {
    const { deps } = stage()
    deps.clientPath = () => join(root!, 'missing-client.js')
    const response = await handleDesktopProtocol(new Request('dsh://app/plugins/@fixture/ui/client.js'), deps)
    expect(response.status).toBe(404)
  })
})
