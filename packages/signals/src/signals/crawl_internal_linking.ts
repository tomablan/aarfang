import type { Signal, SignalResult, AuditContext } from '../types.js'

export const crawlInternalLinking: Signal = {
  id: 'crawl_internal_linking',
  category: 'seo_technique',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    // Pages HTML indexables uniquement (les seules qui comptent pour le maillage SEO)
    const indexable = ctx.crawl.rows.filter(
      (r) => r.statusCode === 200 && r.indexable && r.contentType.includes('text/html'),
    )

    if (indexable.length < 3) {
      return { score: 100, status: 'good', details: { total: indexable.length }, recommendations: [], summary: 'Trop peu de pages pour analyser le maillage' }
    }

    const total = indexable.length

    // ── Orphelines : pages indexables sans aucun lien interne entrant
    const orphans = indexable.filter((r) => r.inlinks === 0)
    const orphanRatio = orphans.length / total

    // ── Sous-linkées : pages en profondeur ≥ 3 avec ≤ 2 liens entrants
    // (contenu potentiellement riche mais mal relié)
    const underlinked = indexable.filter((r) => r.crawlDepth >= 3 && r.inlinks <= 2 && r.inlinks > 0)
    const underlinkedRatio = underlinked.length / total

    // ── Concentration du maillage : pages avec 20+ inlinks (pages surreprésentées)
    const overlinked = indexable.filter((r) => r.inlinks >= 20)

    // ── Distribution : moyenne et médiane des inlinks
    const sortedInlinks = [...indexable].map((r) => r.inlinks).sort((a, b) => a - b)
    const avgInlinks = Math.round(sortedInlinks.reduce((s, v) => s + v, 0) / total)
    const medianInlinks = sortedInlinks[Math.floor(total / 2)]

    // ── Score composite
    const recommendations: string[] = []

    if (orphanRatio > 0.15) {
      const ex = orphans.slice(0, 3).map((r) => r.url)
      recommendations.push(
        `${orphans.length} page${orphans.length > 1 ? 's' : ''} orpheline${orphans.length > 1 ? 's' : ''} (${Math.round(orphanRatio * 100)}% des pages indexables) — sans lien interne entrant, Google ne les découvre pas et elles ne reçoivent aucun PageRank. Exemples : ${ex.join(', ')}.`,
      )
    } else if (orphanRatio > 0.05) {
      recommendations.push(
        `${orphans.length} page${orphans.length > 1 ? 's orphelines' : ' orpheline'} détectée${orphans.length > 1 ? 's' : ''} — les relier depuis des pages de catégorie ou le menu.`,
      )
    }

    if (underlinkedRatio > 0.2) {
      recommendations.push(
        `${underlinked.length} pages en profondeur ≥ 3 avec seulement 1-2 liens intrants — renforcer le maillage vers ces contenus depuis les pages de catégorie et les articles connexes.`,
      )
    }

    if (medianInlinks <= 1 && total > 20) {
      recommendations.push(
        `Médiane des liens internes : ${medianInlinks} — la majorité des pages ne reçoit qu'un seul lien interne. Un maillage en silo ou en toile d'araignée augmenterait significativement l'autorité transmise.`,
      )
    }

    if (overlinked.length > 0 && overlinked.length / total < 0.05) {
      recommendations.push(
        `${overlinked.length} page${overlinked.length > 1 ? 's concentrent' : ' concentre'} l'essentiel des liens internes — redistribuer une partie du maillage vers les pages stratégiques sous-linkées.`,
      )
    }

    if (recommendations.length === 0) {
      recommendations.push('Le maillage interne est bien distribué — continuez à lier les nouveaux contenus depuis les pages existantes à fort trafic.')
    }

    // Score
    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (orphanRatio > 0.3 || (orphanRatio > 0.15 && underlinkedRatio > 0.3)) {
      score = 15; status = 'critical'
    } else if (orphanRatio > 0.15 || underlinkedRatio > 0.4) {
      score = 35; status = 'critical'
    } else if (orphanRatio > 0.05 || underlinkedRatio > 0.25) {
      score = 55; status = 'warning'
    } else if (orphanRatio > 0.02 || underlinkedRatio > 0.15) {
      score = 75; status = 'warning'
    } else {
      score = 95; status = 'good'
    }

    return {
      score,
      status,
      details: {
        total,
        orphans: { count: orphans.length, ratio: Math.round(orphanRatio * 100), examples: orphans.slice(0, 5).map((r) => r.url) },
        underlinked: { count: underlinked.length, ratio: Math.round(underlinkedRatio * 100) },
        overlinked: { count: overlinked.length },
        avgInlinks,
        medianInlinks,
      },
      recommendations,
      summary: orphans.length === 0 && underlinked.length === 0
        ? `Maillage OK — moy. ${avgInlinks} liens/page, médiane ${medianInlinks}`
        : `${orphans.length} orphelines · ${underlinked.length} sous-linkées · moy. ${avgInlinks} liens/page`,
    }
  },
}
