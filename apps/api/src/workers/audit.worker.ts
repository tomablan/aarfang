import { eq, and, desc } from 'drizzle-orm'
import { getDb, audits, auditResults, monitors, sites } from '@aarfang/db'
import { buildAuditContext, runSignals, computeScores } from '@aarfang/signals'
import type { IntegrationCredentials, CrawlData } from '@aarfang/signals'
import type { InferSelectModel } from 'drizzle-orm'
import { loadOrgIntegrations } from '../routes/integrations.js'
import { dispatchAlerts } from '../lib/alerts.js'

type Site = InferSelectModel<typeof sites>

export async function runAudit(auditId: string, site: Site, crawlData?: CrawlData) {
  const db = getDb()

  await db.update(audits).set({ status: 'running', startedAt: new Date() }).where(eq(audits.id, auditId))
  console.log(`[audit:${auditId}] Starting for ${site.url}`)

  try {
    const rawIntegrations = await loadOrgIntegrations(site.orgId)
    const integrations: IntegrationCredentials = {
      pagespeed: rawIntegrations.pagespeed as { apiKey: string } | undefined,
      semrush: rawIntegrations.semrush as { apiKey: string } | undefined,
      gsc: rawIntegrations.gsc as { accessToken: string } | undefined,
      betterstack: rawIntegrations.betterstack as { apiToken: string } | undefined,
      wordpress: rawIntegrations.wordpress as { url: string; applicationPassword: string } | undefined,
      prestashop: rawIntegrations.prestashop as { url: string; apiKey: string } | undefined,
    }

    const ctx = await buildAuditContext(site, integrations, crawlData)
    const results = await runSignals(ctx)

    if (results.length > 0) {
      await db.insert(auditResults).values(
        results.map((r) => ({
          auditId,
          signalId: r.signalId,
          category: r.category,
          score: r.score,
          status: r.status,
          // On glisse le summary dans details pour éviter une migration de schema
          details: r.summary ? { ...r.details, _summary: r.summary } : r.details,
          recommendations: r.recommendations,
        }))
      )
    }

    const scores = computeScores(results)

    await db.update(audits).set({
      status: 'completed',
      completedAt: new Date(),
      scores,
    }).where(eq(audits.id, auditId))

    console.log(`[audit:${auditId}] Completed. Global score: ${scores.global}`)

    // Vérifier la dégradation et déclencher les alertes si nécessaire
    await checkDegradationAndAlert(auditId, site, scores.global, scores)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.update(audits).set({
      status: 'failed',
      completedAt: new Date(),
      errorMessage: message,
    }).where(eq(audits.id, auditId))
    console.error(`[audit:${auditId}] Failed:`, message)
  }
}

async function checkDegradationAndAlert(
  auditId: string,
  site: Site,
  newScore: number,
  scores: ReturnType<typeof computeScores>
) {
  const db = getDb()

  // Récupérer la config monitor du site
  const [monitor] = await db.select().from(monitors)
    .where(eq(monitors.siteId, site.id)).limit(1)

  if (!monitor?.alertOnDegradation || (!monitor.alertEmail && !monitor.alertWebhookUrl)) return

  // Récupérer le score du dernier audit COMPLÉTÉ précédent (hors celui en cours)
  const [previousAudit] = await db.select({ scores: audits.scores })
    .from(audits)
    .where(and(
      eq(audits.siteId, site.id),
      eq(audits.status, 'completed'),
      // Exclure l'audit courant
    ))
    .orderBy(desc(audits.completedAt))
    .offset(1) // le premier résultat est l'audit courant, on prend le suivant
    .limit(1)

  if (!previousAudit?.scores) return

  const previousScore = previousAudit.scores.global
  const drop = previousScore - newScore

  if (drop < monitor.degradationThreshold) return

  console.log(`[alerts] Degradation detected for ${site.name}: ${previousScore} → ${newScore} (−${drop})`)

  await dispatchAlerts(monitor, {
    site: { id: site.id, name: site.name, url: site.url },
    previousScore,
    newScore,
    drop,
    threshold: monitor.degradationThreshold,
    scores,
    auditId,
  })
}
