/** Desktop API carrier: fetch over the privileged `dsh:` protocol, SSE downlinks. */

import { AbstractApiClient } from './api.ts'

/**
 * Electron renderer subclass: unary/respond and mux/host all use `doFetch`.
 * Mux/host keep the base SSE reader — the custom protocol returns
 * `toFetchHandler`'s event-stream body, not a WebSocket.
 */
export class ElectronApiClient extends AbstractApiClient {
  /**
   * Issue one renderer fetch against the privileged protocol origin.
   * @param input - request URL resolved from `location.origin`.
   * @param init - fetch init from the base class.
   * @returns the protocol or network response.
   */
  protected doFetch(input: URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }
}
