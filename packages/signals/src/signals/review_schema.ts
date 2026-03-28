import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

interface JsonLd { [key: string]: unknown }

function extractObjects(json: unknown): JsonLd[] {
  if (!json || typeof json !== 'object') return []
  if (Array.isArray(json)) return json.flatMap(extractObjects)
  const obj = json as JsonLd
  const results: JsonLd[] = [obj]
  if (Array.isArray(obj['@graph'])) results.push(...extractObjects(obj['@graph']))
  // Descendre dans les propriétés pour trouver AggregateRating imbriqué
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      results.push(...extractObjects(val))
    }
  }
  return results
}

function findAggregateRating(objects: JsonLd[]): JsonLd | null {
  return objects.find((obj) => obj['@type'] === 'AggregateRating') ?? null
}

export const reviewSchema: Signal = {
  id: 'review_schema',
  category: 'seo_local',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const allObjects: JsonLd[] = []

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        allObjects.push(...extractObjects(JSON.parse($(el).html() ?? '')))
      } catch {}
    })

    const rating = findAggregateRating(allObjects)

    if (!rating) {
      return {
        score: 25,
        status: 'warning',
        details: { found: false },
        recommendations: [
          'Aucun schema AggregateRating détecté — les étoiles n\'apparaissent pas dans les résultats Google.',
          'Ajouter un schema `AggregateRating` dans un objet LocalBusiness, Product ou Service pour afficher la note directement dans les SERPs (rich snippets).',
        ],
        summary: 'Aucun schema AggregateRating (pas d\'étoiles dans Google)',
      }
    }

    const ratingValue = parseFloat(String(rating['ratingValue'] ?? 0))
    const bestRating = parseFloat(String(rating['bestRating'] ?? 5))
    const reviewCount = parseInt(String(rating['reviewCount'] ?? rating['ratingCount'] ?? 0), 10)

    if (!ratingValue) {
      return {
        score: 30,
        status: 'warning',
        details: { found: true, ratingValue: null, reviewCount },
        recommendations: ['Schema AggregateRating détecté mais `ratingValue` manquant ou invalide — Google ignorera le rich snippet.'],
        summary: 'AggregateRating présent mais incomplet',
      }
    }

    const normalizedRating = bestRating > 0 ? ratingValue / bestRating : ratingValue / 5
    const recommendations: string[] = []

    if (reviewCount < 5) {
      recommendations.push(`Seulement ${reviewCount} avis renseigné(s) — Google requiert généralement au moins 5 avis pour afficher les étoiles.`)
    }
    if (normalizedRating < 0.7) {
      recommendations.push(`Note moyenne faible (${ratingValue}/${bestRating}) — travailler à améliorer la satisfaction client avant de mettre en avant les avis.`)
    }

    // Score
    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (reviewCount >= 10 && normalizedRating >= 0.8) {
      score = 100; status = 'good'
    } else if (reviewCount >= 5 && normalizedRating >= 0.6) {
      score = 75; status = 'good'
    } else if (reviewCount >= 1) {
      score = 50; status = 'warning'
    } else {
      score = 30; status = 'warning'
    }

    const starsDisplay = '★'.repeat(Math.round(normalizedRating * 5)) + '☆'.repeat(5 - Math.round(normalizedRating * 5))

    return {
      score,
      status,
      details: { found: true, ratingValue, bestRating, reviewCount },
      recommendations,
      summary: `${starsDisplay} ${ratingValue}/${bestRating} · ${reviewCount} avis`,
    }
  },
}
