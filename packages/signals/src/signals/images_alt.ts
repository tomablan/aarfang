import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const imagesAlt: Signal = {
  id: 'images_alt',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    // Exclure les images décoratives (alt="" est valide) et les SVG inline
    const images = $('img').filter((_, el) => {
      const src = $(el).attr('src') ?? ''
      return !src.startsWith('data:') // ignorer les data URIs
    })

    const total = images.length
    if (total === 0) {
      return { score: 100, status: 'good', details: { total: 0, missing: 0 }, recommendations: [], summary: 'Aucune image détectée' }
    }

    const missing: string[] = []
    images.each((_, el) => {
      const alt = $(el).attr('alt')
      if (alt === undefined) { // attribut absent = problème (alt="" est ok pour décoratif)
        const src = ($(el).attr('src') ?? '').split('/').pop()?.split('?')[0] ?? 'image'
        missing.push(src.slice(0, 60))
      }
    })

    const missingCount = missing.length
    const ratio = missingCount / total

    if (missingCount === 0) {
      return { score: 100, status: 'good', details: { total, missing: 0 }, recommendations: [], summary: `${total} image(s) — tous les attributs alt présents` }
    }
    if (ratio <= 0.1) {
      return {
        score: 80, status: 'warning',
        details: { total, missing: missingCount, examples: missing.slice(0, 5) },
        recommendations: [`${missingCount} image(s) sans attribut alt. Ajouter un texte alternatif descriptif.`],
        summary: `${missingCount}/${total} images sans alt (${Math.round(ratio * 100)}%)`,
      }
    }
    if (ratio <= 0.3) {
      return {
        score: 50, status: 'warning',
        details: { total, missing: missingCount, examples: missing.slice(0, 5) },
        recommendations: [`${missingCount}/${total} images sans attribut alt (${Math.round(ratio * 100)}%). Corriger pour l'accessibilité et le SEO.`],
        summary: `${missingCount}/${total} images sans alt (${Math.round(ratio * 100)}%)`,
      }
    }
    return {
      score: 20, status: 'critical',
      details: { total, missing: missingCount, examples: missing.slice(0, 5) },
      recommendations: [`${missingCount}/${total} images sans attribut alt (${Math.round(ratio * 100)}%). Problème d'accessibilité et de SEO majeur.`],
      summary: `${missingCount}/${total} images sans alt (${Math.round(ratio * 100)}%) — critique`,
    }
  },
}
