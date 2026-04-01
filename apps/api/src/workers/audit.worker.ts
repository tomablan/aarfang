import { eq, and, desc } from 'drizzle-orm'
import { getDb, audits, auditResults, crawlPages, monitors, sites } from '@aarfang/db'
import { buildAuditContext, runSignals, computeScores, crawlSite } from '@aarfang/signals'
import type { IntegrationCredentials, CrawlData, CrawlOptions } from '@aarfang/signals'
import type { InferSelectModel } from 'drizzle-orm'
import { loadOrgIntegrations } from '../routes/integrations.js'
import { getValidGscToken } from '../lib/gsc-token.js'
import { dispatchAlerts } from '../lib/alerts.js'
import { dispatchWebhooks, auditCompletedPayload, scoreDegradedPayload } from '../lib/webhooks.js'
import { detectTechStack } from '../lib/tech-stack.js'

type Site = InferSelectModel<typeof sites>

export async function runAudit(auditId: string, site: Site, crawlData?: CrawlData, crawlOptions?: CrawlOptions) {
  const db = getDb()

  await db.update(audits).set({ status: 'running', startedAt: new Date() }).where(eq(audits.id, auditId))
  console.log(`[audit:${auditId}] Starting for ${site.url}`)

  // ── Crawl intégré (optionnel) ──
  if (crawlOptions && !crawlData) {
    await db.update(audits).set({ crawlStatus: 'running' }).where(eq(audits.id, auditId))
    console.log(`[audit:${auditId}] Built-in crawl starting (max=${crawlOptions.maxPages}, delay=${crawlOptions.delayMs}ms)`)

    let lastDbUpdate = Date.now()
    try {
      crawlData = await crawlSite(site.url, crawlOptions, async (progress) => {
        // Mise à jour DB au plus toutes les 5 secondes ou tous les 20 URLs
        const now = Date.now()
        if (progress.crawled % 20 === 0 || now - lastDbUpdate > 5000) {
          lastDbUpdate = now
          await db.update(audits)
            .set({ crawlProgress: progress })
            .where(eq(audits.id, auditId))
            .catch(() => { /* non bloquant */ })
        }
      })
      await db.update(audits).set({ crawlStatus: 'done', crawlProgress: null }).where(eq(audits.id, auditId))
      console.log(`[audit:${auditId}] Crawl terminé : ${crawlData.totalUrls} URLs`)
    } catch (err) {
      await db.update(audits).set({ crawlStatus: 'error', crawlProgress: null }).where(eq(audits.id, auditId))
      console.warn(`[audit:${auditId}] Crawl échoué, audit continue sans données crawl :`, err)
      crawlData = undefined
    }
  }

  try {
    const rawIntegrations = await loadOrgIntegrations(site.orgId)

    // Rafraîchir le token GSC si nécessaire avant l'audit
    const gscAccessToken = await getValidGscToken(site.orgId)

    const integrations: IntegrationCredentials = {
      pagespeed: rawIntegrations.pagespeed as { apiKey: string } | undefined,
      semrush: rawIntegrations.semrush as { apiKey: string } | undefined,
      gsc: gscAccessToken ? { accessToken: gscAccessToken } : undefined,
      betterstack: rawIntegrations.betterstack as { apiToken: string } | undefined,
      wordpress: rawIntegrations.wordpress as { url: string; applicationPassword: string } | undefined,
      prestashop: rawIntegrations.prestashop as { url: string; apiKey: string } | undefined,
    }

    const ctx = await buildAuditContext(site, integrations, crawlData)

    // Si le fetch principal a échoué, stocker un message lisible mais continuer l'audit
    // (les signaux HTML retourneront 'skipped', les signaux SSL/HTTPS retourneront 'critical')
    if (ctx.page.fetchError) {
      const typeLabels: Record<string, string> = {
        ssl_expired: 'Certificat SSL expiré — le site est inaccessible.',
        ssl_invalid: 'Erreur SSL — certificat invalide ou mal configuré.',
        timeout: 'Le site n\'a pas répondu dans le délai imparti (15 s).',
        unreachable: 'Serveur inaccessible — vérifiez que le site est en ligne.',
        network: 'Erreur réseau lors de l\'accès au site.',
      }
      const label = typeLabels[ctx.page.fetchErrorType ?? 'network'] ?? 'Site inaccessible lors de l\'audit.'
      await db.update(audits).set({ errorMessage: label }).where(eq(audits.id, auditId))
      console.warn(`[audit:${auditId}] Site inaccessible (${ctx.page.fetchErrorType}): ${ctx.page.fetchError}`)
    }

    // Détecter et sauvegarder le tech stack (silencieux si erreur)
    try {
      const techStack = detectTechStack(ctx.page.headers, ctx.page.html, site.url)
      if (Object.keys(techStack).length > 0) {
        await db.update(sites).set({ techStack, techStackAt: new Date() }).where(eq(sites.id, site.id))
      }
    } catch { /* non bloquant */ }

    // Persister les pages crawlées pour l'arbre de navigation
    if (crawlData && crawlData.rows.length > 0) {
      const BATCH = 500
      for (let i = 0; i < crawlData.rows.length; i += BATCH) {
        const batch = crawlData.rows.slice(i, i + BATCH)
        await db.insert(crawlPages).values(
          batch.map((r) => ({
            auditId,
            url: r.url,
            statusCode: r.statusCode,
            title: r.title || null,
            indexable: r.indexable,
            crawlDepth: r.crawlDepth,
            inlinks: r.inlinks,
            wordCount: r.wordCount || null,
            contentType: r.contentType || null,
          }))
        ).catch((err) => console.warn('[audit] crawl_pages insert error:', err))
      }
      console.log(`[audit:${auditId}] ${crawlData.rows.length} pages crawlées persistées`)
    }

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

    // Webhooks audit.completed
    await dispatchWebhooks(
      site.orgId, 'audit.completed', site.id,
      auditCompletedPayload({ id: site.id, name: site.name, url: site.url }, auditId, scores),
    ).catch((err) => console.error('[webhooks] audit.completed dispatch error:', err))

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

  // Webhooks score.degraded
  await dispatchWebhooks(
    site.orgId, 'score.degraded', site.id,
    scoreDegradedPayload({ id: site.id, name: site.name, url: site.url }, auditId, previousScore, newScore, drop, scores),
  ).catch((err) => console.error('[webhooks] score.degraded dispatch error:', err))

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
