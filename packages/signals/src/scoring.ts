import type { AuditSignalResult, AuditScores, SignalCategory } from './types.js'
import { ALL_SIGNALS } from './runner.js'

const CATEGORY_WEIGHTS: Record<SignalCategory, number> = {
  technique: 1.0,
  securite: 1.5,
  conformite: 1.2,
  seo_technique: 1.0,
  seo_local: 0.8,
  opportunites: 0.7,
  sea: 0.6,
  accessibilite: 0.8,
}

export function computeScores(results: AuditSignalResult[]): AuditScores {
  const categories: SignalCategory[] = [
    'technique', 'securite', 'conformite', 'seo_technique', 'seo_local', 'opportunites', 'sea', 'accessibilite',
  ]

  const categoryScores = Object.fromEntries(
    categories.map((cat) => {
      const relevant = results.filter((r) => r.category === cat && r.status !== 'skipped' && r.score !== null)
      if (relevant.length === 0) return [cat, null]

      const signalWeightMap = Object.fromEntries(ALL_SIGNALS.map((s) => [s.id, s.weight]))
      const totalWeight = relevant.reduce((sum, r) => sum + (signalWeightMap[r.signalId] ?? 1), 0)
      const earned = relevant.reduce((sum, r) => sum + (r.score ?? 0) * (signalWeightMap[r.signalId] ?? 1), 0)
      return [cat, Math.round(earned / totalWeight)]
    })
  ) as Record<SignalCategory, number | null>

  let globalNumerator = 0
  let globalDenominator = 0
  for (const cat of categories) {
    const score = categoryScores[cat]
    if (score !== null) {
      globalNumerator += score * CATEGORY_WEIGHTS[cat]
      globalDenominator += CATEGORY_WEIGHTS[cat]
    }
  }
  const global = globalDenominator > 0 ? Math.round(globalNumerator / globalDenominator) : 0

  return {
    global,
    technique: categoryScores.technique ?? 0,
    securite: categoryScores.securite ?? 0,
    conformite: categoryScores.conformite ?? 0,
    seo_technique: categoryScores.seo_technique ?? 0,
    seo_local: categoryScores.seo_local ?? 0,
    opportunites: categoryScores.opportunites ?? 0,
    sea: categoryScores.sea ?? 0,
    accessibilite: categoryScores.accessibilite ?? 0,
  }
}
