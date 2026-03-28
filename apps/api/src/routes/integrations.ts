import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, integrations } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { encrypt, decrypt } from '../lib/crypto.js'

const app = new Hono()
app.use('*', authMiddleware)

// Lister les intégrations de l'org (credentials masqués)
app.get('/', async (c) => {
  const orgId = c.get('orgId') as string
  const db = getDb()
  const rows = await db.select().from(integrations).where(eq(integrations.orgId, orgId))

  return c.json(rows.map((row) => {
    // Pour GSC : indiquer si le flow OAuth a été complété (refresh token présent)
    let oauthConnected: boolean | undefined
    if (row.provider === 'gsc') {
      try {
        const creds = JSON.parse(decrypt(row.credentials))
        oauthConnected = !!(creds.refreshToken && creds.accessToken)
      } catch {
        oauthConnected = false
      }
    }
    return {
      id: row.id,
      orgId: row.orgId,
      siteId: row.siteId,
      provider: row.provider,
      status: row.status,
      createdAt: row.createdAt,
      lastTestedAt: row.lastTestedAt,
      ...(oauthConnected !== undefined ? { oauthConnected } : {}),
    }
  }))
})

// Créer ou remplacer une intégration (upsert par orgId + provider + siteId)
app.post('/', async (c) => {
  const orgId = c.get('orgId') as string
  const { provider, credentials: rawCredentials, siteId = null } = await c.req.json<{
    provider: string
    credentials: Record<string, string>
    siteId?: string | null
  }>()

  if (!provider || !rawCredentials) return c.json({ error: 'provider and credentials required' }, 400)

  const encryptedCredentials = encrypt(JSON.stringify(rawCredentials))
  const db = getDb()

  // Supprimer l'ancienne intégration du même type pour cette org/site
  await db.delete(integrations).where(
    and(
      eq(integrations.orgId, orgId),
      eq(integrations.provider, provider as any),
      siteId ? eq(integrations.siteId, siteId) : eq(integrations.siteId, null as any)
    )
  )

  const [created] = await db.insert(integrations).values({
    orgId,
    siteId: siteId ?? null,
    provider: provider as any,
    credentials: encryptedCredentials,
    status: 'active',
  }).returning({
    id: integrations.id,
    orgId: integrations.orgId,
    siteId: integrations.siteId,
    provider: integrations.provider,
    status: integrations.status,
    createdAt: integrations.createdAt,
  })

  return c.json(created, 201)
})

// Supprimer une intégration
app.delete('/:id', async (c) => {
  const orgId = c.get('orgId') as string
  const { id } = c.req.param()
  const db = getDb()

  const [deleted] = await db.delete(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.orgId, orgId)))
    .returning({ id: integrations.id })

  if (!deleted) return c.json({ error: 'Integration not found' }, 404)
  return c.json({ success: true })
})

// Tester la connectivité d'une intégration
app.post('/:id/test', async (c) => {
  const orgId = c.get('orgId') as string
  const { id } = c.req.param()
  const db = getDb()

  const [row] = await db.select().from(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.orgId, orgId)))
    .limit(1)

  if (!row) return c.json({ error: 'Integration not found' }, 404)

  let credentials: Record<string, string> = {}
  try {
    credentials = JSON.parse(decrypt(row.credentials))
  } catch {
    return c.json({ ok: false, error: 'Failed to decrypt credentials' })
  }

  const result = await testIntegration(row.provider, credentials)

  // Mettre à jour lastTestedAt et status
  await db.update(integrations).set({
    lastTestedAt: new Date(),
    status: result.ok ? 'active' : 'invalid',
  }).where(eq(integrations.id, id))

  return c.json(result)
})

async function testIntegration(provider: string, credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (provider) {
      case 'pagespeed': {
        const key = credentials.apiKey
        if (!key) return { ok: false, error: 'apiKey manquante' }
        const res = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile&category=performance&key=${key}`,
          { signal: AbortSignal.timeout(15_000) }
        )
        if (res.status === 403 || res.status === 400) return { ok: false, error: 'Clé API invalide' }
        return { ok: res.ok }
      }
      case 'semrush': {
        const key = credentials.apiKey
        if (!key) return { ok: false, error: 'apiKey manquante' }
        const res = await fetch(`https://api.semrush.com/?type=phrase_this&key=${key}&phrase=test&database=fr`, { signal: AbortSignal.timeout(10_000) })
        return { ok: res.ok || res.status !== 403 }
      }
      case 'betterstack': {
        const token = credentials.apiToken
        if (!token) return { ok: false, error: 'apiToken manquant' }
        const res = await fetch('https://uptime.betterstack.com/api/v2/monitors', {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        })
        return { ok: res.ok }
      }
      case 'gsc': {
        // Vérifier que les credentials OAuth sont présents et le token valide
        const accessToken = credentials.accessToken
        if (!credentials.clientId || !credentials.clientSecret) return { ok: false, error: 'Client ID et Client Secret requis' }
        if (!accessToken) return { ok: false, error: 'Non connecté — cliquez sur "Connecter avec Google"' }
        const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.status === 401) return { ok: false, error: 'Token expiré ou révoqué — reconnectez-vous' }
        return { ok: res.ok }
      }
      case 'claude': {
        const key = credentials.apiKey
        if (!key) return { ok: false, error: 'apiKey manquante' }
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.status === 401) return { ok: false, error: 'Clé API Anthropic invalide' }
        return { ok: res.ok }
      }
      case 'openai': {
        const key = credentials.apiKey
        if (!key) return { ok: false, error: 'apiKey manquante' }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.status === 401) return { ok: false, error: 'Clé API OpenAI invalide' }
        return { ok: res.ok }
      }
      default:
        return { ok: true }
    }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export { app as integrationsRoutes }

// Fonction utilitaire exportée pour le worker d'audit
export async function loadOrgIntegrations(orgId: string): Promise<Record<string, Record<string, string>>> {
  const db = getDb()
  const rows = await db.select({
    provider: integrations.provider,
    credentials: integrations.credentials,
    status: integrations.status,
  }).from(integrations).where(and(eq(integrations.orgId, orgId), eq(integrations.status, 'active')))

  const result: Record<string, Record<string, string>> = {}
  for (const row of rows) {
    try {
      result[row.provider] = JSON.parse(decrypt(row.credentials))
    } catch {
      // credentials corrompus → on ignore silencieusement
    }
  }
  return result
}
