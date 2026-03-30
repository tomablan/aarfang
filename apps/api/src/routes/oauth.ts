import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, integrations } from '@aarfang/db'
import { verifyToken, signToken } from '../lib/jwt.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { env } from '../env.js'

const app = new Hono()

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

function redirectUri() {
  return `${env.APP_URL}/api/oauth/gsc/callback`
}

interface GscStoredCredentials {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

async function loadGscCredentials(orgId: string): Promise<{ row: typeof integrations.$inferSelect; creds: GscStoredCredentials } | null> {
  const db = getDb()
  const [row] = await db.select().from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, 'gsc')))
    .limit(1)
  if (!row) return null
  try {
    const creds = JSON.parse(decrypt(row.credentials)) as GscStoredCredentials
    return { row, creds }
  } catch {
    return null
  }
}

// GET /api/oauth/gsc?token=<jwt>
// Lance le flow OAuth Google Search Console en utilisant les credentials du tenant
app.get('/gsc', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'token requis' }, 400)

  let payload: { sub: string; orgId: string }
  try {
    payload = await verifyToken(token) as { sub: string; orgId: string }
  } catch {
    return c.json({ error: 'Token invalide ou expiré' }, 401)
  }

  const stored = await loadGscCredentials(payload.orgId)
  if (!stored) {
    return c.json({ error: 'Configurez d\'abord le Client ID et Client Secret Google dans les intégrations.' }, 422)
  }

  // State signé : userId + orgId, expire dans 10 minutes
  const state = await signToken({ sub: payload.sub, orgId: payload.orgId, role: '' }, '10m')

  const params = new URLSearchParams({
    client_id: stored.creds.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return c.redirect(`https://accounts.google.com/o/oauth2/auth?${params}`)
})

// GET /api/oauth/gsc/callback?code=xxx&state=xxx
app.get('/gsc/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  const failUrl = `${env.APP_URL}/settings/integrations?gsc=error`

  if (error || !code || !state) {
    return c.redirect(`${failUrl}&message=${encodeURIComponent(error ?? 'Connexion annulée')}`)
  }

  let payload: { sub: string; orgId: string }
  try {
    payload = await verifyToken(state) as { sub: string; orgId: string }
  } catch {
    return c.redirect(`${failUrl}&message=${encodeURIComponent('State invalide ou expiré')}`)
  }

  // Récupérer les credentials du tenant pour l'échange de code
  const stored = await loadGscCredentials(payload.orgId)
  if (!stored) {
    return c.redirect(`${failUrl}&message=${encodeURIComponent('Intégration GSC introuvable')}`)
  }

  let tokens: { access_token: string; refresh_token?: string; expires_in: number }
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: stored.creds.clientId,
        client_secret: stored.creds.clientSecret,
        redirect_uri: redirectUri(),
        code,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any
      throw new Error(body.error_description ?? 'Échange de code échoué')
    }
    tokens = await res.json() as typeof tokens
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.redirect(`${failUrl}&message=${encodeURIComponent(msg)}`)
  }

  if (!tokens.refresh_token) {
    return c.redirect(`${failUrl}&message=${encodeURIComponent("Refresh token absent — révoque l'accès dans ton compte Google et réessaie")}`)
  }

  // Mettre à jour l'intégration existante en ajoutant les tokens OAuth
  const updatedCreds: GscStoredCredentials = {
    clientId: stored.creds.clientId,
    clientSecret: stored.creds.clientSecret,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  }

  const db = getDb()
  await db.update(integrations).set({
    credentials: encrypt(JSON.stringify(updatedCreds)),
    status: 'active',
    lastTestedAt: new Date(),
  }).where(eq(integrations.id, stored.row.id))

  return c.redirect(`${env.APP_URL}/settings/integrations?gsc=connected`)
})

export { app as oauthRoutes }
