import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { getDb, sites, audits, auditResults } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { canAccessSite } from '../lib/access.js'
import { runAudit } from '../workers/audit.worker.js'
import { parseScreamingFrogCsv, type CrawlData } from '@aarfang/signals'

const app = new Hono()
app.use('*', authMiddleware)

// Déclencher un audit manuel
app.post('/sites/:siteId/audits', async (c) => {
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

  // Lire le CSV Screaming Frog si fourni (multipart ou JSON)
  let crawlData: CrawlData | undefined
  const contentType = c.req.header('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await c.req.formData()
      const csvFile = formData.get('crawlFile')
      if (csvFile && typeof csvFile !== 'string') {
        const text = await (csvFile as File).text()
        crawlData = parseScreamingFrogCsv(text)
        console.log(`[audit] Crawl SF chargé : ${crawlData.totalUrls} URLs`)
      }
    } catch (err) {
      console.warn('[audit] Erreur parsing CSV SF :', err)
      // On continue sans crawl plutôt que de bloquer l'audit
    }
  }

  // Créer l'enregistrement d'audit
  const [audit] = await db.insert(audits).values({
    siteId,
    triggeredBy: userId,
    status: 'pending',
  }).returning()

  // Lancer le runner en arrière-plan (sans bloquer la réponse)
  setImmediate(() => {
    runAudit(audit.id, site, crawlData).catch((err) => {
      console.error(`[audit:${audit.id}] Fatal error:`, err)
    })
  })

  return c.json({ auditId: audit.id, status: 'pending', crawlUrls: crawlData?.totalUrls ?? 0 }, 202)
})

// Historique des audits d'un site
app.get('/sites/:siteId/audits', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  const db = getDb()

  if (!await canAccessSite(db, siteId, orgId, userId, role)) {
    return c.json({ error: 'Site not found' }, 404)
  }

  const history = await db.select().from(audits)
    .where(eq(audits.siteId, siteId))
    .orderBy(desc(audits.createdAt))
    .limit(20)

  return c.json(history)
})

// Dernier audit complété avec résultats
app.get('/sites/:siteId/audits/latest', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  const db = getDb()

  if (!await canAccessSite(db, siteId, orgId, userId, role)) {
    return c.json({ error: 'Site not found' }, 404)
  }

  const [audit] = await db.select().from(audits)
    .where(and(eq(audits.siteId, siteId), eq(audits.status, 'completed')))
    .orderBy(desc(audits.completedAt))
    .limit(1)

  if (!audit) return c.json(null)

  const results = await db.select().from(auditResults).where(eq(auditResults.auditId, audit.id))
  return c.json({ ...audit, results })
})

// Détail d'un audit (avec polling de statut)
app.get('/audits/:auditId', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const { auditId } = c.req.param()
  const db = getDb()

  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1)
  if (!audit) return c.json({ error: 'Audit not found' }, 404)

  if (!await canAccessSite(db, audit.siteId, orgId, userId, role)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (audit.status !== 'completed') return c.json(audit)

  const results = await db.select().from(auditResults).where(eq(auditResults.auditId, auditId))
  return c.json({ ...audit, results })
})

export { app as auditRoutes }
