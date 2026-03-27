import type { Signal, SignalResult, AuditContext } from '../types.js'

const MAX_RECOMMENDED_DEPTH = 3

export const crawlDepth: Signal = {
  id: 'crawl_depth',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const htmlPages = ctx.crawl.rows.filter((r) => r.statusCode === 200 && r.crawlDepth > 0)
    const total = htmlPages.length

    if (total === 0) {
      return { score: 0, status: 'skipped', details: { reason: 'Profondeur de crawl non disponible dans le crawl' }, recommendations: [] }
    }

    const deep = htmlPages.filter((r) => r.crawlDepth > MAX_RECOMMENDED_DEPTH)
    const count = deep.length
    const ratio = count / total

    // Distribution par profondeur
    const depthDist: Record<number, number> = {}
    for (const r of htmlPages) {
      depthDist[r.crawlDepth] = (depthDist[r.crawlDepth] ?? 0) + 1
    }

    if (count === 0) {
      const maxDepth = Math.max(...htmlPages.map((r) => r.crawlDepth))
      return {
        score: 100, status: 'good',
        details: { total, deep: 0, maxDepth, distribution: depthDist },
        recommendations: [],
        summary: `Profondeur max ${maxDepth} — toutes les pages à ≤ ${MAX_RECOMMENDED_DEPTH} clics`,
      }
    }

    const maxDepth = Math.max(...deep.map((r) => r.crawlDepth))
    const score = ratio > 0.3 ? 20 : ratio > 0.15 ? 45 : ratio > 0.05 ? 65 : 80
    const status = score < 50 ? 'critical' : 'warning'

    return {
      score,
      status,
      details: {
        total, deep: count, maxDepth, threshold: MAX_RECOMMENDED_DEPTH, distribution: depthDist,
        examples: deep.slice(0, 10).map((r) => ({ url: r.url, depth: r.crawlDepth })),
      },
      recommendations: [`${count} page(s) à plus de ${MAX_RECOMMENDED_DEPTH} clics de la page d'accueil (max détecté : ${maxDepth}). Retravailler la structure de navigation.`],
      summary: `${count}/${total} pages à profondeur > ${MAX_RECOMMENDED_DEPTH} · max ${maxDepth}`,
    }
  },
}
