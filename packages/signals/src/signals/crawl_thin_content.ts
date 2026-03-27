import type { Signal, SignalResult, AuditContext } from '../types.js'

const THIN_THRESHOLD = 300 // mots

export const crawlThinContent: Signal = {
  id: 'crawl_thin_content',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    // Uniquement les pages indexables avec word count disponible
    const htmlPages = ctx.crawl.rows.filter((r) => r.statusCode === 200 && r.indexable && r.wordCount > 0)
    const total = htmlPages.length

    if (total === 0) {
      return { score: 0, status: 'skipped', details: { reason: 'Comptage de mots non disponible dans le crawl' }, recommendations: [] }
    }

    const thin = htmlPages.filter((r) => r.wordCount < THIN_THRESHOLD)
    const count = thin.length
    const ratio = count / total

    if (count === 0) {
      return { score: 100, status: 'good', details: { total, thin: 0, threshold: THIN_THRESHOLD }, recommendations: [], summary: `${total} pages — aucun thin content (min ${THIN_THRESHOLD} mots)` }
    }

    const avgWords = Math.round(thin.reduce((s, r) => s + r.wordCount, 0) / count)
    const score = ratio > 0.3 ? 20 : ratio > 0.2 ? 40 : ratio > 0.1 ? 60 : 75
    const status = score < 50 ? 'critical' : 'warning'

    return {
      score,
      status,
      details: {
        total,
        thin: count,
        threshold: THIN_THRESHOLD,
        avgWordsThin: avgWords,
        examples: thin.slice(0, 10).map((r) => ({ url: r.url, wordCount: r.wordCount })),
      },
      recommendations: [`${count} page(s) avec moins de ${THIN_THRESHOLD} mots (moy. ${avgWords} mots). Enrichir le contenu ou noindex ces pages.`],
      summary: `${count}/${total} pages thin content · moy. ${avgWords} mots`,
    }
  },
}
