import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'

// En production (domaines séparés), ce handler reçoit le callback Google et le
// proxie vers l'API. En développement, le proxy Vite intercepte avant que ce
// handler ne soit atteint.
export const GET: RequestHandler = async ({ url }) => {
  const apiBase = env.API_URL ?? 'http://localhost:3001'
  const target = `${apiBase}/api/oauth/gsc/callback${url.search}`

  const response = await fetch(target, { redirect: 'manual' })

  const location = response.headers.get('location')
  if (location) {
    return new Response(null, { status: response.status, headers: { location } })
  }

  const body = await response.text()
  return new Response(body, { status: response.status })
}
