import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { getDb, sites, audits, auditResults } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { canAccessSite } from '../lib/access.js'
import { runAudit } from '../workers/audit.worker.js'
import { parseScreamingFrogCsv, DEFAULT_CRAWL_OPTIONS, type CrawlData, type CrawlOptions } from '@aarfang/signals'

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()
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

  // Lire le mode de crawl et les options depuis le body (FormData)
  let crawlData: CrawlData | undefined
  let crawlOptions: CrawlOptions | undefined
  let crawlMode: 'none' | 'auto' | 'file' = 'none'

  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await c.req.formData()
      const mode = formData.get('crawlMode')
      crawlMode = (mode === 'auto' || mode === 'file') ? mode : 'none'

      if (crawlMode === 'file') {
        const csvFile = formData.get('crawlFile')
        if (csvFile && typeof csvFile !== 'string') {
          const text = await (csvFile as File).text()
          crawlData = parseScreamingFrogCsv(text)
          console.log(`[audit] Crawl SF chargé : ${crawlData.totalUrls} URLs`)
        }
      } else if (crawlMode === 'auto') {
        const raw = formData.get('crawlOptions')
        const parsed = raw && typeof raw === 'string' ? JSON.parse(raw) : {}
        crawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...parsed }
        if (crawlOptions) console.log(`[audit] Crawl auto configuré : max=${crawlOptions.maxPages}, delay=${crawlOptions.delayMs}ms`)
      }
    } catch (err) {
      console.warn('[audit] Erreur parsing FormData :', err)
    }
  }

  // Créer l'enregistrement d'audit
  const [audit] = await db.insert(audits).values({
    siteId,
    triggeredBy: userId,
    status: 'pending',
    crawlStatus: crawlMode === 'auto' ? 'pending' : null,
  }).returning()

  // Lancer le runner en arrière-plan (sans bloquer la réponse)
  setImmediate(() => {
    runAudit(audit.id, site, crawlData, crawlOptions).catch((err) => {
      console.error(`[audit:${audit.id}] Fatal error:`, err)
    })
  })

  return c.json({ auditId: audit.id, status: 'pending', crawlMode, crawlUrls: crawlData?.totalUrls ?? 0 }, 202)
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
