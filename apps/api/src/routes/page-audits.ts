import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, sites, pageAudits } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { canAccessSite } from '../lib/access.js'
import { runPageAudit } from '../workers/page-audit.worker.js'

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()
app.use('*', authMiddleware)

// Déclencher un deep score sur une URL précise
app.post('/sites/:siteId/page-audits', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  const db = getDb()

  if (!await canAccessSite(db, siteId, orgId, userId, role)) {
    return c.json({ error: 'Site not found' }, 404)
  }

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  const body = await c.req.json<{ url?: string }>().catch(() => ({}))
  const url = body.url?.trim()
  if (!url) return c.json({ error: 'URL required' }, 400)

  // Valider que l'URL appartient bien au domaine du site
  try {
    const targetHost = new URL(url).hostname
    const siteHost = new URL(site.url).hostname
    if (targetHost !== siteHost) {
      return c.json({ error: 'URL must belong to the site domain' }, 400)
    }
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }

  const [record] = await db.insert(pageAudits).values({ siteId, url, status: 'pending' }).returning()

  setImmediate(() => {
    runPageAudit(record.id, site, url).catch((err) => {
      console.error(`[page-audit:${record.id}] Fatal error:`, err)
    })
  })

  return c.json({ id: record.id, status: 'pending' }, 202)
})

// Polling du statut
app.get('/page-audits/:id', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const { id } = c.req.param()
  const db = getDb()

  const [record] = await db.select().from(pageAudits).where(eq(pageAudits.id, id)).limit(1)
  if (!record) return c.json({ error: 'Not found' }, 404)

  if (!await canAccessSite(db, record.siteId, orgId, userId, role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json(record)
})

export { app as pageAuditsRoutes }
