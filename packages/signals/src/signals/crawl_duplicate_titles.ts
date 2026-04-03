import type { Signal, SignalResult, AuditContext } from '../types.js'

export const crawlDuplicateTitles: Signal = {
  id: 'crawl_duplicate_titles',
  category: 'seo_technique',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const indexableHtml = ctx.crawl.rows.filter((r) => r.statusCode === 200)
    if (indexableHtml.length === 0) {
      return { score: 100, status: 'good', details: { total: 0, duplicates: 0 }, recommendations: [], summary: 'Aucune page à analyser' }
    }

    // Grouper par titre non-vide
    const titleMap = new Map<string, string[]>()
    for (const row of indexableHtml) {
      const t = row.title.trim()
      if (!t) continue
      const existing = titleMap.get(t) ?? []
      existing.push(row.url)
      titleMap.set(t, existing)
    }

    const duplicateGroups = [...titleMap.entries()].filter(([, urls]) => urls.length > 1)
    const affectedUrls = duplicateGroups.reduce((sum, [, urls]) => sum + urls.length, 0)
    const total = indexableHtml.length
    const ratio = affectedUrls / total

    if (duplicateGroups.length === 0) {
      return { score: 100, status: 'good', details: { total, duplicates: 0, groups: 0 }, recommendations: [], summary: `${total} pages — aucun doublon de titre` }
    }

    const examples = duplicateGroups.slice(0, 10).map(([title, urls]) => ({ title: title.slice(0, 80), count: urls.length, urls: urls.slice(0, 5) }))
    const score = ratio > 0.2 ? 20 : ratio > 0.1 ? 40 : ratio > 0.05 ? 60 : 75
    const status = score < 50 ? 'critical' : 'warning'

    return {
      score,
      status,
      details: { total, duplicateGroups: duplicateGroups.length, affectedUrls, examples },
      recommendations: [`${duplicateGroups.length} groupe(s) de titres dupliqués affectant ${affectedUrls} pages. Rendre chaque titre unique.`],
      summary: `${duplicateGroups.length} doublons de titres · ${affectedUrls}/${total} pages affectées`,
    }
  },
}
