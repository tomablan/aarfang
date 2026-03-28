import type { Signal, SignalResult, AuditContext } from '../types.js'

const STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux', 'ce', 'se',
  'sur', 'par', 'pour', 'dans', 'avec', 'est', 'son', 'sa', 'ses', 'qui', 'que', 'pas',
  'the', 'a', 'an', 'of', 'in', 'to', 'and', 'for', 'on', 'at', 'by', 'is', 'are', 'or',
  'meilleur', 'meilleure', 'best', 'top', 'tout', 'toute', 'tous', 'votre', 'notre',
])

/** Tokenise un texte en mots significatifs (minuscules, sans ponctuation, sans stopwords). */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  )
}

/** Jaccard similarity entre deux ensembles de tokens. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export const crawlCannibalization: Signal = {
  id: 'crawl_cannibalization',
  category: 'seo_technique',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    if (!ctx.crawl) {
      return { score: 0, status: 'skipped', details: { reason: 'Aucun crawl Screaming Frog fourni' }, recommendations: [] }
    }

    const indexable = ctx.crawl.rows.filter(
      (r) => r.statusCode === 200 && r.indexable && r.contentType.includes('text/html') && r.title.trim(),
    )

    if (indexable.length < 5) {
      return { score: 100, status: 'good', details: { total: indexable.length, groups: 0 }, recommendations: [], summary: 'Trop peu de pages pour analyser la cannibalisation' }
    }

    // Construire le vecteur de tokens pour chaque page
    // On combine titre + H1 pour maximiser la pertinence sémantique
    const pages = indexable.map((r) => ({
      url: r.url,
      title: r.title.trim(),
      h1: r.h1.trim(),
      tokens: tokenize(`${r.title} ${r.h1}`),
    }))

    // Seuil Jaccard au-delà duquel on considère qu'il y a cannibalisation potentielle
    const THRESHOLD = 0.55

    // Union-Find pour grouper les pages cannibalisantes
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      if (!parent.has(x)) return x
      const root = find(parent.get(x)!)
      parent.set(x, root)
      return root
    }
    const union = (x: string, y: string) => {
      const rx = find(x), ry = find(y)
      if (rx !== ry) parent.set(rx, ry)
    }

    // Comparaison O(n²) — acceptable jusqu'à ~2000 pages
    const limit = Math.min(pages.length, 2000)
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        if (pages[i].tokens.size === 0 || pages[j].tokens.size === 0) continue
        if (jaccard(pages[i].tokens, pages[j].tokens) >= THRESHOLD) {
          union(pages[i].url, pages[j].url)
        }
      }
    }

    // Regrouper
    const groupMap = new Map<string, typeof pages>()
    for (const p of pages.slice(0, limit)) {
      const root = find(p.url)
      if (!groupMap.has(root)) groupMap.set(root, [])
      groupMap.get(root)!.push(p)
    }

    const cannibGroups = [...groupMap.values()]
      .filter((g) => g.length >= 2)
      .sort((a, b) => b.length - a.length)

    if (cannibGroups.length === 0) {
      return {
        score: 100,
        status: 'good',
        details: { total: pages.length, groups: 0 },
        recommendations: ['Aucune cannibalisation sémantique détectée entre les titres et H1 des pages indexables.'],
        summary: `${pages.length} pages analysées — aucune cannibalisation`,
      }
    }

    const totalAffected = cannibGroups.reduce((s, g) => s + g.length, 0)
    const ratio = totalAffected / pages.length

    const groupExamples = cannibGroups.slice(0, 5).map((g) => ({
      count: g.length,
      titles: g.slice(0, 3).map((p) => ({ url: p.url, title: p.title.slice(0, 70) })),
    }))

    const recommendations: string[] = []

    const topGroup = cannibGroups[0]
    recommendations.push(
      `${cannibGroups.length} groupe${cannibGroups.length > 1 ? 's' : ''} de cannibalisation détecté${cannibGroups.length > 1 ? 's' : ''}, affectant ${totalAffected} pages. Google ne sait pas quelle URL positionner — les pages se concurrencent mutuellement.`,
    )

    if (topGroup.length >= 3) {
      const titles = topGroup.slice(0, 3).map((p) => `"${p.title.slice(0, 50)}"`).join(', ')
      recommendations.push(
        `Groupe le plus critique (${topGroup.length} pages) : ${titles}. Action : fusionner en une seule page canonique ou différencier nettement les intentions de recherche ciblées.`,
      )
    }

    recommendations.push(
      'Pour chaque groupe : définir une URL canonique principale, rediriger les variantes en 301, ou réécrire les titres/H1 pour cibler des intentions de recherche distinctes.',
    )

    if (ratio > 0.2) {
      recommendations.push(
        'Plus de 20% des pages sont concernées — une restructuration de l\'arborescence et une stratégie de contenu pilier/cluster est fortement recommandée.',
      )
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (ratio > 0.25 || cannibGroups.length > 10) { score = 10; status = 'critical' }
    else if (ratio > 0.1 || cannibGroups.length > 5) { score = 30; status = 'critical' }
    else if (ratio > 0.05 || cannibGroups.length > 2) { score = 55; status = 'warning' }
    else { score = 75; status = 'warning' }

    return {
      score,
      status,
      details: {
        total: pages.length,
        groups: cannibGroups.length,
        affectedPages: totalAffected,
        affectedRatio: Math.round(ratio * 100),
        examples: groupExamples,
        threshold: THRESHOLD,
      },
      recommendations,
      summary: `${cannibGroups.length} groupe${cannibGroups.length > 1 ? 's' : ''} de cannibalisation · ${totalAffected} pages affectées (${Math.round(ratio * 100)}%)`,
    }
  },
}
