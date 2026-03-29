import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const ecoImageOptimization: Signal = {
  id: 'eco_image_optimization',
  category: 'ecoconception',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const images = $('img').toArray()

    if (images.length === 0) {
      return {
        score: 100,
        status: 'good',
        details: { total: 0 },
        recommendations: [],
        summary: 'Aucune image détectée',
      }
    }

    let withLazy = 0
    let withDimensions = 0
    let withModernFormat = 0

    for (const img of images) {
      const el = $(img)
      const loading = el.attr('loading')
      const src = (el.attr('src') ?? '').toLowerCase()
      const srcset = (el.attr('srcset') ?? '').toLowerCase()
      const width = el.attr('width')
      const height = el.attr('height')

      if (loading === 'lazy') withLazy++
      if (width && height) withDimensions++
      if (
        src.includes('.webp') || src.includes('.avif') ||
        srcset.includes('.webp') || srcset.includes('.avif') ||
        el.parent().is('picture')
      ) withModernFormat++
    }

    const total = images.length
    const lazyRatio = withLazy / total
    const dimRatio = withDimensions / total

    const issues: string[] = []
    const recommendations: string[] = []

    if (lazyRatio < 0.8) {
      const missing = total - withLazy
      issues.push(`${missing}/${total} images sans lazy loading`)
      recommendations.push(
        `Ajouter loading="lazy" sur ${missing} image${missing > 1 ? 's' : ''} pour différer leur chargement et réduire la consommation réseau.`
      )
    }
    if (dimRatio < 0.8) {
      const missing = total - withDimensions
      issues.push(`${missing}/${total} images sans dimensions`)
      recommendations.push(
        `Ajouter les attributs width et height sur ${missing} image${missing > 1 ? 's' : ''} pour éviter les layout shifts et permettre au navigateur de réserver l'espace.`
      )
    }
    if (withModernFormat === 0 && total > 0) {
      issues.push('Aucun format moderne (WebP/AVIF)')
      recommendations.push(
        'Servir les images en WebP ou AVIF via une balise <picture> : ces formats réduisent le poids de 25–50 % par rapport à JPEG/PNG.'
      )
    }

    let score: number
    if (issues.length === 0) score = 100
    else if (issues.length === 1 && lazyRatio >= 0.5) score = 70
    else if (issues.length <= 2 && lazyRatio >= 0.2) score = 40
    else score = 15

    return {
      score,
      status: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical',
      details: { total, withLazy, withDimensions, withModernFormat, lazyRatio: Math.round(lazyRatio * 100) },
      recommendations,
      summary: issues.length === 0
        ? `${total} image${total > 1 ? 's' : ''} bien optimisée${total > 1 ? 's' : ''}`
        : issues.join(' · '),
    }
  },
}
