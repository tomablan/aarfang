import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, sites, monitors } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { scheduleMonitor, unscheduleMonitor } from '../lib/queue.js'

const app = new Hono()
app.use('*', authMiddleware)

// Récupérer la config monitor d'un site
app.get('/sites/:siteId/monitor', async (c) => {
  const orgId = c.get('orgId') as string
  const { siteId } = c.req.param()
  const db = getDb()

  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  const [monitor] = await db.select().from(monitors).where(eq(monitors.siteId, siteId)).limit(1)
  return c.json(monitor ?? null)
})

// Créer ou mettre à jour le monitor d'un site
app.put('/sites/:siteId/monitor', async (c) => {
  const orgId = c.get('orgId') as string
  const { siteId } = c.req.param()
  const body = await c.req.json<{
    enabled: boolean
    interval: 'daily' | 'weekly' | 'monthly'
    alertOnDegradation: boolean
    degradationThreshold: number
    alertEmail?: string | null
    alertWebhookUrl?: string | null
  }>()

  const db = getDb()
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
  if (!site) return c.json({ error: 'Site not found' }, 404)

  // Calculer nextRunAt selon l'intervalle
  const nextRunAt = body.enabled ? computeNextRun(body.interval) : null

  // Upsert du monitor
  const existing = await db.select({ id: monitors.id }).from(monitors)
    .where(eq(monitors.siteId, siteId)).limit(1)

  let monitor
  if (existing.length > 0) {
    ;[monitor] = await db.update(monitors).set({
      enabled: body.enabled,
      interval: body.interval,
      alertOnDegradation: body.alertOnDegradation,
      degradationThreshold: body.degradationThreshold,
      alertEmail: body.alertEmail ?? null,
      alertWebhookUrl: body.alertWebhookUrl ?? null,
      nextRunAt,
    }).where(eq(monitors.siteId, siteId)).returning()
  } else {
    ;[monitor] = await db.insert(monitors).values({
      siteId,
      enabled: body.enabled,
      interval: body.interval,
      alertOnDegradation: body.alertOnDegradation,
      degradationThreshold: body.degradationThreshold,
      alertEmail: body.alertEmail ?? null,
      alertWebhookUrl: body.alertWebhookUrl ?? null,
      nextRunAt,
    }).returning()
  }

  // Synchroniser le job BullMQ
  if (body.enabled) {
    await scheduleMonitor(siteId, body.interval)
  } else {
    await unscheduleMonitor(siteId)
  }

  return c.json(monitor)
})

function computeNextRun(interval: 'daily' | 'weekly' | 'monthly'): Date {
  const now = new Date()
  const next = new Date(now)
  next.setHours(6, 0, 0, 0)

  if (interval === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1)
  } else if (interval === 'weekly') {
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7
    next.setDate(now.getDate() + daysUntilMonday)
  } else {
    next.setMonth(next.getMonth() + 1, 1)
  }
  return next
}

export { app as monitorsRoutes }
