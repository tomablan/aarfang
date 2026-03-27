import type { Signal, SignalResult, AuditContext } from '../types.js'

export const crawlNoindex: Signal = {
  id: 'crawl_noindex',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const htmlPages = ctx.crawl.rows.filter((r) => r.statusCode === 200)
    const total = htmlPages.length

    if (total === 0) {
      return { score: 100, status: 'good', details: { total: 0, noindex: 0 }, recommendations: [], summary: 'Aucune page à analyser' }
    }

    const noindexPages = htmlPages.filter((r) =>
      !r.indexable || r.metaRobots.includes('noindex')
    )
    const count = noindexPages.length
    const ratio = count / total

    if (count === 0) {
      return { score: 100, status: 'good', details: { total, noindex: 0 }, recommendations: [], summary: `${total} pages — toutes indexables` }
    }

    // Distinguer noindex explicites vs non-indexables (canoniques, etc.)
    const explicitNoindex = noindexPages.filter((r) => r.metaRobots.includes('noindex'))
    const otherNonIndexable = noindexPages.filter((r) => !r.metaRobots.includes('noindex'))

    // Un taux de noindex élevé peut signifier des problèmes (pages utiles bloquées)
    // ou être intentionnel (pages de pagination, filtres, etc.)
    const score = ratio > 0.5 ? 20 : ratio > 0.3 ? 50 : ratio > 0.15 ? 70 : 85
    const status = score < 50 ? 'critical' : score < 80 ? 'warning' : 'good'

    return {
      score,
      status,
      details: {
        total,
        noindex: count,
        explicitNoindex: explicitNoindex.length,
        otherNonIndexable: otherNonIndexable.length,
        examples: noindexPages.slice(0, 10).map((r) => ({ url: r.url, robots: r.metaRobots || 'non-indexable' })),
      },
      recommendations: ratio > 0.15
        ? [`${count} page(s) non-indexées (${Math.round(ratio * 100)}%). Vérifier que les pages importantes ne sont pas exclues par erreur.`]
        : [],
      summary: `${count}/${total} pages non-indexées · ${explicitNoindex.length} noindex explicites`,
    }
  },
}
