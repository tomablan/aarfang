import { eq } from 'drizzle-orm'
import { getDb, pageAudits, sites } from '@aarfang/db'
import { buildAuditContext, runSignals, computeScores } from '@aarfang/signals'
import type { IntegrationCredentials } from '@aarfang/signals'
import type { InferSelectModel } from 'drizzle-orm'
import { loadOrgIntegrations } from '../routes/integrations.js'
import { getValidGscToken } from '../lib/gsc-token.js'

type Site = InferSelectModel<typeof sites>

export async function runPageAudit(pageAuditId: string, site: Site, url: string) {
  const db = getDb()

  await db.update(pageAudits).set({ status: 'running' }).where(eq(pageAudits.id, pageAuditId))
  console.log(`[page-audit:${pageAuditId}] Starting for ${url}`)

  try {
    const rawIntegrations = await loadOrgIntegrations(site.orgId)
    const gscAccessToken = await getValidGscToken(site.orgId)

    const integrations: IntegrationCredentials = {
      pagespeed: rawIntegrations.pagespeed as { apiKey: string } | undefined,
      semrush: rawIntegrations.semrush as { apiKey: string } | undefined,
      gsc: gscAccessToken ? { accessToken: gscAccessToken } : undefined,
      betterstack: rawIntegrations.betterstack as { apiToken: string } | undefined,
      wordpress: rawIntegrations.wordpress as { url: string; applicationPassword: string } | undefined,
      prestashop: rawIntegrations.prestashop as { url: string; apiKey: string } | undefined,
      claude: rawIntegrations.claude as { apiKey: string } | undefined,
      openai: rawIntegrations.openai as { apiKey: string } | undefined,
    }

    // Construire le contexte avec l'URL de la page cible (pas celle du site)
    const ctx = await buildAuditContext({ ...site, url }, integrations)

    const results = await runSignals(ctx)
    const scores = computeScores(results)

    await db.update(pageAudits).set({
      status: 'completed',
      completedAt: new Date(),
      scores,
      results: results.map((r) => ({
        signalId: r.signalId,
        category: r.category,
        score: r.score,
        status: r.status,
        details: r.summary ? { ...r.details, _summary: r.summary } : r.details,
        recommendations: r.recommendations,
      })),
    }).where(eq(pageAudits.id, pageAuditId))

    console.log(`[page-audit:${pageAuditId}] Completed. Global: ${scores.global}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.update(pageAudits).set({
      status: 'failed',
      completedAt: new Date(),
      errorMessage: message,
    }).where(eq(pageAudits.id, pageAuditId))
    console.error(`[page-audit:${pageAuditId}] Failed:`, message)
  }
}
