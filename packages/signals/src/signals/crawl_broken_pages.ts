import type { Signal, SignalResult, AuditContext } from '../types.js'

export const crawlBrokenPages: Signal = {
  id: 'crawl_broken_pages',
  category: 'seo_technique',
  weight: 4,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const total = ctx.crawl.rows.length
    const broken = ctx.crawl.rows.filter((r) => r.statusCode >= 400)
    const count = broken.length

    if (count === 0) {
      return { score: 100, status: 'good', details: { total, broken: 0 }, recommendations: [], summary: `${total} pages crawlées — aucune erreur 4xx/5xx` }
    }

    const byStatus: Record<number, string[]> = {}
    for (const r of broken) {
      byStatus[r.statusCode] = byStatus[r.statusCode] ?? []
      byStatus[r.statusCode].push(r.url)
    }

    const ratio = count / total
    const has5xx = broken.some((r) => r.statusCode >= 500)
    const score = has5xx ? 0 : ratio > 0.1 ? 10 : ratio > 0.05 ? 30 : ratio > 0.02 ? 50 : 70
    const status = score < 40 ? 'critical' : 'warning'

    const examples = broken.slice(0, 10).map((r) => ({ url: r.url, status: r.statusCode }))
    const statusSummary = Object.entries(byStatus).map(([s, urls]) => `${urls.length} × ${s}`).join(', ')

    return {
      score,
      status,
      details: { total, broken: count, byStatus: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, v.slice(0, 5)])) },
      recommendations: [`${count} page(s) en erreur (${statusSummary}). Corriger ou rediriger ces URLs.`],
      summary: `${count}/${total} pages en erreur · ${statusSummary}`,
      ...(examples.length > 0 ? {} : {}),
    }
  },
}
