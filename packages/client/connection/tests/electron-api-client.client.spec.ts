/** ElectronApiClient: unary and SSE downlinks share doFetch. */
import { describe, expect, it, vi } from 'vitest'
import { ElectronApiClient } from '../src/client/electron-api-client.ts'
import { RpcId, type RpcMessage } from '../src/client/api.ts'

describe('ElectronApiClient', () => {
  it('sends unary calls and respond through fetch, and reads SSE downlinks', async () => {
    const seen: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      seen.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/api/events.mux')) {
        const body = ': connected\n\n'
          + `data: ${JSON.stringify({
            type: 'server-request',
            rpcId: 'mux-desktop',
            method: 'session/subscribed',
            payload: { type: 'session/subscribed', sessionId: 'session-desktop', lastSeq: 3 },
          })}\n\n`
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
      }
      if (url.includes('/api/respond')) {
        return Response.json({ accepted: true })
      }
      if (typeof init?.body !== 'string') return new Response('{}', { status: 200 })
      const body = JSON.parse(init.body) as { rpcId: string }
      return Response.json({
        type: 'server-response',
        rpcId: body.rpcId,
        result: {
          ok: true,
          value: { version: '0.0.0', cwd: '/', attachedSessions: 0, home: '/', canOpenPath: true },
        },
      })
    }
    const client = new ElectronApiClient()
    const envelopes: RpcMessage[][] = []
    client.subscribeEnvelopes((batch) => { envelopes.push([...batch]) })
    try {
      const described = await client.host.describe({})
      expect(described.result.ok).toBe(true)
      await client.respond({
        type: 'client-response',
        rpcId: RpcId('desktop-respond'),
        result: { ok: true, value: {} },
      })
      const abort = new AbortController()
      const iterator = client.events.mux({}, abort.signal)[Symbol.asyncIterator]()
      await expect(iterator.next()).resolves.toMatchObject({
        value: { rpcId: 'mux-desktop', payload: { type: 'session/subscribed', lastSeq: 3 } },
      })
      abort.abort()
    } finally {
      globalThis.fetch = original
    }
    expect(seen.some(line => line.includes('POST') && line.includes('/api/host.describe'))).toBe(true)
    expect(seen.some(line => line.includes('POST') && line.includes('/api/respond'))).toBe(true)
    expect(seen.some(line => line.includes('/api/events.mux'))).toBe(true)
    expect(seen.some(line => line.includes('WebSocket'))).toBe(false)
    expect(envelopes.flat().length).toBeGreaterThan(0)
  })

  it('reports a transport failure when an SSE response is not ok', async () => {
    const original = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('no', { status: 503 }))
    const client = new ElectronApiClient()
    try {
      await expect(client.events.mux({}, new AbortController().signal)[Symbol.asyncIterator]().next())
        .rejects.toThrow('HTTP 503')
    } finally {
      globalThis.fetch = original
    }
  })
})
