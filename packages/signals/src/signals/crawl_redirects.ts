import type { Signal, SignalResult, AuditContext } from '../types.js'

export const crawlRedirects: Signal = {
  id: 'crawl_redirects',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const total = ctx.crawl.rows.length
    const redirects = ctx.crawl.rows.filter((r) => r.statusCode >= 300 && r.statusCode < 400)
    const count = redirects.length

    if (count === 0) {
      return { score: 100, status: 'good', details: { total, redirects: 0 }, recommendations: [], summary: `Aucune redirection interne détectée` }
    }

    const by301 = redirects.filter((r) => r.statusCode === 301).length
    const by302 = redirects.filter((r) => r.statusCode === 302).length
    const ratio = count / total

    const score = ratio > 0.15 ? 30 : ratio > 0.05 ? 60 : 80
    const status = score < 50 ? 'critical' : 'warning'

    return {
      score,
      status,
      details: {
        total, redirects: count, by301, by302,
        examples: redirects.slice(0, 10).map((r) => ({ url: r.url, status: r.statusCode })),
      },
      recommendations: [`${count} page(s) en redirection interne. Mettre à jour les liens vers les URLs finales pour éviter des sauts inutiles.`],
      summary: `${count} redirections internes · ${by301} × 301, ${by302} × 302`,
    }
  },
}
