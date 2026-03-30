import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getDb, webhooks } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { dispatchWebhooks } from '../lib/webhooks.js'

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()
app.use('*', authMiddleware)

const ALLOWED_EVENTS = ['audit.completed', 'score.degraded']

// GET /api/webhooks — liste les webhooks de l'org
app.get('/', async (c) => {
  const orgId = c.get('orgId') as string
  const db = getDb()
  const rows = await db.select().from(webhooks).where(eq(webhooks.orgId, orgId))
  return c.json(rows)
})

// POST /api/webhooks — crée un webhook
app.post('/', async (c) => {
  const orgId = c.get('orgId') as string
  const body = await c.req.json<{
    name: string
    url: string
    events?: string[]
    siteId?: string
    generateSecret?: boolean
  }>()

  if (!body.name?.trim() || !body.url?.trim()) {
    return c.json({ error: 'name et url sont requis' }, 400)
  }

  try { new URL(body.url) } catch {
    return c.json({ error: 'URL invalide' }, 400)
  }

  const events = (body.events ?? ['audit.completed']).filter((e) => ALLOWED_EVENTS.includes(e))
  if (events.length === 0) return c.json({ error: 'Au moins un événement valide requis' }, 400)

  const secret = body.generateSecret ? randomBytes(24).toString('hex') : null

  const db = getDb()
  const [created] = await db.insert(webhooks).values({
    orgId,
    name: body.name.trim(),
    url: body.url.trim(),
    events,
    siteId: body.siteId ?? null,
    secret,
    enabled: true,
  }).returning()

  return c.json(created, 201)
})

// PUT /api/webhooks/:id — met à jour un webhook
app.put('/:id', async (c) => {
  const orgId = c.get('orgId') as string
  const { id } = c.req.param()
  const body = await c.req.json<Partial<{
    name: string
    url: string
    events: string[]
    siteId: string | null
    enabled: boolean
    regenerateSecret: boolean
  }>>()

  const db = getDb()
  const [existing] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId))).limit(1)
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const updates: Partial<typeof existing> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.url !== undefined) {
    try { new URL(body.url) } catch { return c.json({ error: 'URL invalide' }, 400) }
    updates.url = body.url.trim()
  }
  if (body.events !== undefined) {
    const filtered = body.events.filter((e) => ALLOWED_EVENTS.includes(e))
    if (filtered.length === 0) return c.json({ error: 'Au moins un événement valide' }, 400)
    updates.events = filtered
  }
  if (body.siteId !== undefined) updates.siteId = body.siteId
  if (body.enabled !== undefined) updates.enabled = body.enabled
  if (body.regenerateSecret) updates.secret = randomBytes(24).toString('hex')

  const [updated] = await db.update(webhooks).set(updates).where(eq(webhooks.id, id)).returning()
  return c.json(updated)
})

// DELETE /api/webhooks/:id
app.delete('/:id', async (c) => {
  const orgId = c.get('orgId') as string
  const { id } = c.req.param()
  const db = getDb()
  const result = await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId))).returning()
  if (result.length === 0) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

// POST /api/webhooks/:id/test — envoie un payload de test
app.post('/:id/test', async (c) => {
  const orgId = c.get('orgId') as string
  const { id } = c.req.param()
  const db = getDb()

  const [webhook] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId))).limit(1)
  if (!webhook) return c.json({ error: 'Not found' }, 404)

  try {
    await dispatchWebhooks(orgId, 'audit.completed', null, {
      _test: true,
      site: { id: 'test-site-id', name: 'Site de test', url: 'https://example.com' },
      auditId: 'test-audit-id',
      scores: { global: 72, securite: 85, technique: 70, conformite: 60, seo_technique: 75, seo_local: 55, opportunites: 80, sea: 40, accessibilite: 65 },
      reportUrl: '#',
    })
    return c.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, error: message }, 502)
  }
})

export const webhooksRoutes = app
