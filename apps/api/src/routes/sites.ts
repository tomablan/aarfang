import { Hono } from 'hono'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getDb, sites, audits, auditResults, siteMembers, users } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { isPrivileged, canAccessSite } from '../lib/access.js'
import { generateAiSummary, generateAiRecommendations, type AiSummaryInput, type AiRecommendationsInput } from '../lib/ai.js'
import { loadOrgIntegrations } from './integrations.js'

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()
app.use('*', authMiddleware)

// Lister les sites de l'org (filtrés selon le rôle)
app.get('/', async (c) => {
  const orgId = c.get('orgId') as string
  const userId = c.get('userId') as string
  const role = c.get('role') as string
  const db = getDb()

  let rows
  if (isPrivileged(role)) {
    rows = await db.select().from(sites).where(eq(sites.orgId, orgId))
  } else {
    // member/viewer : uniquement les sites assignés
    const memberships = await db
      .select({ siteId: siteMembers.siteId })
      .from(siteMembers)
      .innerJoin(sites, eq(siteMembers.siteId, sites.id))
      .where(and(eq(siteMembers.userId, userId), eq(sites.orgId, orgId)))
    const siteIds = memberships.map((m) => m.siteId)
    if (siteIds.length === 0) return c.json([])
    rows = await db.select().from(sites).where(inArray(sites.id, siteIds))
  }

  const enriched = await Promise.all(rows.map(async (site) => {
    const [latestAudit] = await db
      .select({ id: audits.id, status: audits.status, scores: audits.scores, completedAt: audits.completedAt, crawlStatus: audits.crawlStatus })
      .from(audits)
      .where(and(eq(audits.siteId, site.id), eq(audits.status, 'completed')))
      .orderBy(audits.createdAt)
      .limit(1)
    return { ...site, latestAudit: latestAudit ?? null }
  }))

  return c.json(enriched)
})

// Créer un site (owner/admin uniquement)
app.post('/', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden — admin or owner required' }, 403)

  const { url, name, cmsType, isEcommerce } = await c.req.json<{
    url: string
    name: string
    cmsType?: 'wordpress' | 'prestashop' | 'other'
    isEcommerce?: boolean
  }>()
  if (!url || !name) return c.json({ error: 'url and name are required' }, 400)

  let normalizedUrl = url.trim()
  if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl

  const db = getDb()
  const [site] = await db.insert(sites).values({
    orgId,
    url: normalizedUrl,
    name: name.trim(),
    cmsType: cmsType ?? 'other',
    isEcommerce: isEcommerce ?? false,
  }).returning()

  return c.json(site, 201)
})

// Import bulk de sites (owner/admin uniquement)
app.post('/bulk', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden — admin or owner required' }, 403)

  const { sites: toImport } = await c.req.json<{
    sites: Array<{ url: string; name: string; cmsType?: string; isEcommerce?: boolean }>
  }>()

  if (!Array.isArray(toImport) || toImport.length === 0) {
    return c.json({ error: 'sites array is required' }, 400)
  }
  if (toImport.length > 200) {
    return c.json({ error: 'Maximum 200 sites per import' }, 400)
  }

  const db = getDb()
  const results = await Promise.all(
    toImport.map(async (item, i) => {
      if (!item.url || !item.name) {
        return { index: i, status: 'error', error: 'url and name are required' }
      }
      try {
        let normalizedUrl = item.url.trim()
        if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl

        const validCmsTypes = ['wordpress', 'prestashop', 'other']
        const cmsType = validCmsTypes.includes(item.cmsType ?? '') ? item.cmsType as 'wordpress' | 'prestashop' | 'other' : 'other'

        const [site] = await db.insert(sites).values({
          orgId,
          url: normalizedUrl,
          name: item.name.trim(),
          cmsType,
          isEcommerce: item.isEcommerce ?? false,
        }).returning({ id: sites.id, name: sites.name, url: sites.url })

        return { index: i, status: 'created', site }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { index: i, status: 'error', error: message }
      }
    })
  )

  return c.json({ results })
})

// Détail d'un site
app.get('/:siteId', async (c) => {
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
  return c.json(site)
})

// Mettre à jour un site (owner/admin uniquement)
app.put('/:siteId', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden — admin or owner required' }, 403)

  const body = await c.req.json<Partial<{ url: string; name: string; cmsType: 'wordpress' | 'prestashop' | 'other'; isEcommerce: boolean; status: 'active' | 'paused' | 'archived' }>>()
  const db = getDb()
  const [site] = await db.update(sites).set(body)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).returning()

  if (!site) return c.json({ error: 'Site not found' }, 404)
  return c.json(site)
})

// Supprimer un site (owner/admin uniquement)
app.delete('/:siteId', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden — admin or owner required' }, 403)

  const db = getDb()
  const [deleted] = await db.delete(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).returning()

  if (!deleted) return c.json({ error: 'Site not found' }, 404)
  return c.json({ success: true })
})

// ─── Résumé commercial IA ─────────────────────────────────────────────────────

// POST /api/sites/:siteId/summary — génère un résumé commercial via IA
app.post('/:siteId/summary', async (c) => {
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

  // Charger les credentials IA depuis les intégrations de l'org
  const orgIntegrations = await loadOrgIntegrations(orgId)
  const claudeKey = orgIntegrations.claude?.apiKey as string | undefined
  const openaiKey = orgIntegrations.openai?.apiKey as string | undefined

  if (!claudeKey && !openaiKey) {
    return c.json({ error: "Aucune intégration IA configurée. Ajoutez une clé Claude ou OpenAI dans Paramètres → Intégrations." }, 503)
  }

  // Récupérer le dernier audit complété avec ses résultats
  const [latestAudit] = await db.select().from(audits)
    .where(and(eq(audits.siteId, siteId), eq(audits.status, 'completed')))
    .orderBy(desc(audits.completedAt))
    .limit(1)

  if (!latestAudit?.scores) {
    return c.json({ error: 'Aucun audit complété disponible pour ce site' }, 422)
  }

  const results = await db.select().from(auditResults).where(eq(auditResults.auditId, latestAudit.id))

  const input: AiSummaryInput = {
    site: {
      name: site.name,
      url: site.url,
      cmsType: site.cmsType,
      isEcommerce: site.isEcommerce,
    },
    scores: latestAudit.scores,
    issues: results
      .filter((r) => r.status !== 'skipped')
      .map((r) => ({
        signalId: r.signalId,
        category: r.category,
        score: r.score,
        status: r.status,
        recommendations: (r.recommendations as string[]) ?? [],
      }))
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100)),
  }

  try {
    const summary = await generateAiSummary(input, claudeKey, openaiKey)
    await db.update(sites).set({ aiSummary: summary, aiSummaryAt: new Date() }).where(eq(sites.id, siteId))
    return c.json({ summary, generatedAt: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai-summary] Error for site ${siteId}:`, message)
    return c.json({ error: message }, 502)
  }
})

// ─── Recommandations stratégiques IA ──────────────────────────────────────────

// POST /api/sites/:siteId/recommendations — génère des recommandations sectorielles via IA
app.post('/:siteId/recommendations', async (c) => {
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

  const orgIntegrations = await loadOrgIntegrations(orgId)
  const claudeKey = orgIntegrations.claude?.apiKey as string | undefined
  const openaiKey = orgIntegrations.openai?.apiKey as string | undefined

  if (!claudeKey && !openaiKey) {
    return c.json({ error: "Aucune intégration IA configurée. Ajoutez une clé Claude ou OpenAI dans Paramètres → Intégrations." }, 503)
  }

  const [latestAudit] = await db.select().from(audits)
    .where(and(eq(audits.siteId, siteId), eq(audits.status, 'completed')))
    .orderBy(desc(audits.completedAt))
    .limit(1)

  if (!latestAudit?.scores) {
    return c.json({ error: 'Aucun audit complété disponible pour ce site' }, 422)
  }

  const results = await db.select().from(auditResults).where(eq(auditResults.auditId, latestAudit.id))

  const input: AiRecommendationsInput = {
    site: {
      name: site.name,
      url: site.url,
      cmsType: site.cmsType,
      isEcommerce: site.isEcommerce,
    },
    scores: latestAudit.scores,
    issues: results
      .filter((r) => r.status !== 'skipped')
      .map((r) => ({
        signalId: r.signalId,
        category: r.category,
        score: r.score,
        status: r.status,
        recommendations: (r.recommendations as string[]) ?? [],
      }))
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100)),
  }

  try {
    const recommendations = await generateAiRecommendations(input, claudeKey, openaiKey)
    await db.update(sites).set({ aiRecommendations: recommendations, aiRecommendationsAt: new Date() }).where(eq(sites.id, siteId))
    return c.json({ recommendations, generatedAt: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai-recommendations] Error for site ${siteId}:`, message)
    return c.json({ error: message }, 502)
  }
})

// ─── Gestion des accès membres au site ────────────────────────────────────────

// GET /api/sites/:siteId/members — liste les membres ayant accès
app.get('/:siteId/members', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden' }, 403)

  const db = getDb()
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  const members = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      grantedAt: siteMembers.createdAt,
    })
    .from(siteMembers)
    .innerJoin(users, eq(siteMembers.userId, users.id))
    .where(eq(siteMembers.siteId, siteId))

  return c.json(members)
})

// POST /api/sites/:siteId/members — donner accès à un membre
app.post('/:siteId/members', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  const { siteId } = c.req.param()
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden' }, 403)

  const { userId } = await c.req.json<{ userId: string }>()
  if (!userId) return c.json({ error: 'userId is required' }, 400)

  const db = getDb()

  // Vérifier que le site appartient à l'org
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  // Vérifier que l'utilisateur appartient à l'org
  const [user] = await db.select({ id: users.id, role: users.role }).from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId))).limit(1)
  if (!user) return c.json({ error: 'User not found in this organization' }, 404)

  // owner/admin ont déjà accès à tout — pas besoin de les ajouter
  if (isPrivileged(user.role)) {
    return c.json({ error: 'Owner and admin already have access to all sites' }, 400)
  }

  // Insérer (ignorer si déjà présent via ON CONFLICT)
  await db.insert(siteMembers).values({ siteId, userId }).onConflictDoNothing()
  return c.json({ success: true }, 201)
})

// DELETE /api/sites/:siteId/members/:userId — révoquer l'accès
app.delete('/:siteId/members/:userId', async (c) => {
  const orgId = c.get('orgId') as string
  const role = c.get('role') as string
  const { siteId, userId } = c.req.param()
  if (!isPrivileged(role)) return c.json({ error: 'Forbidden' }, 403)

  const db = getDb()
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  await db.delete(siteMembers).where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)))
  return c.json({ success: true })
})

export { app as sitesRoutes }
