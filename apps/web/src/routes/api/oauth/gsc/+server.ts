import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'

// Proxy vers l'API Hono pour initier le flow OAuth GSC.
// En dev, Vite intercepte cette route via le proxy. En prod (domaines séparés),
// ce handler redirige vers l'API. Évite de dépendre d'une variable VITE_ baked au build.
export const GET: RequestHandler = async ({ url }) => {
  const apiBase = env.API_URL ?? 'http://localhost:3001'
  const token = url.searchParams.get('token') ?? ''
  const target = `${apiBase}/api/oauth/gsc?token=${encodeURIComponent(token)}`

  return new Response(null, {
    status: 302,
    headers: { location: target },
  })
}
