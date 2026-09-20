// The one place the key is used. It lives as a Worker secret and is read here,
// inside the Durable Object, so it never reaches the browser.

import type { SystemOneLike } from '@jev-mice/provider-jev'
import type { Env } from './env.js'

export function httpClient(env: Env): SystemOneLike {
  const baseURL = env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai'
  const model = env.TYPESAFE_DEFAULT_MODEL ?? 'jev-latest'
  const key = env.TYPESAFE_API_KEY ?? ''
  return {
    async systemOne(request, options) {
      const response = await fetch(`${baseURL}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, ...request }),
        ...(options?.signal ? { signal: options.signal } : {}),
      })
      if (!response.ok) {
        throw new Error(`decision service answered ${String(response.status)}`)
      }
      return await response.json() as Awaited<ReturnType<SystemOneLike['systemOne']>>
    },
  }
}
