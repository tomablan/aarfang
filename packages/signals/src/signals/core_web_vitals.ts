import type { Signal, SignalResult, AuditContext } from '../types.js'

type CrUXCategory = 'FAST' | 'AVERAGE' | 'SLOW'

interface CrUXMetric {
  percentile: number
  category: CrUXCategory
}

interface LoadingExperience {
  metrics?: {
    LARGEST_CONTENTFUL_PAINT_MS?: CrUXMetric
    CUMULATIVE_LAYOUT_SHIFT_SCORE?: CrUXMetric
    INTERACTION_TO_NEXT_PAINT?: CrUXMetric
    FIRST_CONTENTFUL_PAINT_MS?: CrUXMetric
  }
  overall_category?: CrUXCategory
}

async function fetchCrUX(url: string, apiKey: string): Promise<LoadingExperience | null> {
  const params = new URLSearchParams({ url, strategy: 'mobile', key: apiKey })
  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    { signal: AbortSignal.timeout(30_000) },
  )
  if (!res.ok) return null
  const data = await res.json() as { loadingExperience?: LoadingExperience }
  const exp = data.loadingExperience
  // Si pas de overall_category → pas assez de données CrUX pour ce site
  if (!exp?.overall_category) return null
  return exp
}

const CATEGORY_SCORE: Record<CrUXCategory, number> = { FAST: 100, AVERAGE: 55, SLOW: 15 }
const CATEGORY_LABEL: Record<CrUXCategory, string> = { FAST: 'Rapide', AVERAGE: 'Moyen', SLOW: 'Lent' }

export const coreWebVitals: Signal = {
  id: 'core_web_vitals',
  category: 'technique',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const apiKey = ctx.integrations.pagespeed?.apiKey
    if (!apiKey) {
      return {
        score: 0,
        status: 'skipped',
        details: { reason: 'Intégration PageSpeed non configurée' },
        recommendations: ['Configurer l\'intégration PageSpeed Insights pour accéder aux données terrain Core Web Vitals.'],
      }
    }

    try {
      const exp = await fetchCrUX(ctx.site.url, apiKey)

      if (!exp) {
        return {
          score: 0,
          status: 'skipped',
          details: { reason: 'Données terrain insuffisantes (trafic trop faible pour CrUX)' },
          recommendations: ['Le site ne reçoit pas assez de trafic pour générer des données terrain CrUX — les scores PageSpeed simulés restent disponibles via le signal Performance.'],
          summary: 'Données terrain indisponibles (trafic insuffisant)',
        }
      }

      const overall = exp.overall_category!
      const lcp = exp.metrics?.LARGEST_CONTENTFUL_PAINT_MS
      const cls = exp.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE
      const inp = exp.metrics?.INTERACTION_TO_NEXT_PAINT
      const fcp = exp.metrics?.FIRST_CONTENTFUL_PAINT_MS

      const recommendations: string[] = []

      if (lcp?.category === 'SLOW') {
        recommendations.push(`LCP lent (${(lcp.percentile / 1000).toFixed(1)}s réel · cible < 2.5s) — optimiser les images hero, le serveur et le cache.`)
      } else if (lcp?.category === 'AVERAGE') {
        recommendations.push(`LCP moyen (${(lcp.percentile / 1000).toFixed(1)}s) — quelques optimisations d'images ou de serveur pourraient passer en "Rapide".`)
      }

      if (cls?.category === 'SLOW') {
        recommendations.push(`CLS élevé (${(cls.percentile / 1000).toFixed(3)} · cible < 0.1) — les éléments de la page bougent visiblement au chargement, réserver la taille des images et publicités.`)
      }

      if (inp?.category === 'SLOW') {
        recommendations.push(`INP lent (${inp.percentile}ms · cible < 200ms) — le site réagit lentement aux interactions, réduire le JavaScript bloquant.`)
      }

      if (overall === 'FAST' && recommendations.length === 0) {
        recommendations.push('Maintenir les performances — surveiller après chaque mise à jour significative.')
      }

      // Score pondéré par les métriques individuelles (LCP = 40%, CLS = 30%, INP = 30%)
      let score: number
      if (lcp && cls && inp) {
        score = Math.round(
          CATEGORY_SCORE[lcp.category] * 0.4 +
          CATEGORY_SCORE[cls.category] * 0.3 +
          CATEGORY_SCORE[inp.category] * 0.3,
        )
      } else {
        score = CATEGORY_SCORE[overall]
      }

      const status = score >= 80 ? 'good' : score >= 40 ? 'warning' : 'critical'

      const summaryParts: string[] = [`Terrain : ${CATEGORY_LABEL[overall]}`]
      if (lcp) summaryParts.push(`LCP ${(lcp.percentile / 1000).toFixed(1)}s`)
      if (cls) summaryParts.push(`CLS ${(cls.percentile / 1000).toFixed(3)}`)
      if (inp) summaryParts.push(`INP ${inp.percentile}ms`)

      return {
        score,
        status,
        details: {
          overall,
          lcp: lcp ? { value: lcp.percentile, category: lcp.category } : null,
          cls: cls ? { value: cls.percentile, category: cls.category } : null,
          inp: inp ? { value: inp.percentile, category: inp.category } : null,
          fcp: fcp ? { value: fcp.percentile, category: fcp.category } : null,
        },
        recommendations,
        summary: summaryParts.join(' · '),
      }
    } catch (err) {
      return { score: 0, status: 'skipped', details: { error: String(err) }, recommendations: [] }
    }
  },
}
