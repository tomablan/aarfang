import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const FONT_PROVIDERS = [
  { pattern: /fonts\.googleapis\.com/, name: 'Google Fonts' },
  { pattern: /fonts\.gstatic\.com/, name: 'Google Fonts' },
  { pattern: /use\.typekit\.net|p\.typekit\.net/, name: 'Adobe Fonts (Typekit)' },
  { pattern: /cloud\.typography\.com/, name: 'H&Co Cloud.Typography' },
  { pattern: /fast\.fonts\.net/, name: 'Fonts.com' },
  { pattern: /cdn\.fonts\.net/, name: 'Fonts.com' },
  { pattern: /use\.fontawesome\.com|kit\.fontawesome\.com/, name: 'Font Awesome' },
]

export const ecoFonts: Signal = {
  id: 'eco_fonts',
  category: 'ecoconception',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const detectedProviders = new Set<string>()
    const detectedUrls: string[] = []

    // <link rel="stylesheet"> vers CDN de polices
    $('link[rel="stylesheet"], link[rel="preconnect"], link[rel="preload"]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      for (const { pattern, name } of FONT_PROVIDERS) {
        if (pattern.test(href)) {
          detectedProviders.add(name)
          detectedUrls.push(href.slice(0, 80))
        }
      }
    })

    // <script src="..."> pour Font Awesome kit
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src') ?? ''
      for (const { pattern, name } of FONT_PROVIDERS) {
        if (pattern.test(src)) {
          detectedProviders.add(name)
        }
      }
    })

    // @import dans <style> inline
    $('style').each((_, el) => {
      const css = $(el).text()
      for (const { pattern, name } of FONT_PROVIDERS) {
        if (pattern.test(css)) detectedProviders.add(name)
      }
      // Compter les @font-face déclarées en inline
      const fontFaceCount = (css.match(/@font-face/gi) ?? []).length
      if (fontFaceCount > 0) detectedProviders.add(`${fontFaceCount} @font-face inline`)
    })

    const count = detectedProviders.size
    const providers = Array.from(detectedProviders)

    if (count === 0) {
      return {
        score: 100,
        status: 'good',
        details: { externalFontProviders: 0, providers: [] },
        recommendations: [],
        summary: 'Aucune police externe — rendu système ou auto-hébergée',
      }
    }
    if (count === 1) {
      const isIconFont = providers[0].includes('Font Awesome')
      return {
        score: isIconFont ? 60 : 80,
        status: 'warning',
        details: { externalFontProviders: count, providers },
        recommendations: isIconFont
          ? ['Font Awesome chargé en entier. Utiliser uniquement les icônes nécessaires (SVG individuels ou version subset) pour réduire le poids.']
          : [`Police externe via ${providers[0]}. Envisager l'auto-hébergement (font-display: swap) ou utiliser des polices système pour éliminer la requête externe.`],
        summary: `1 fournisseur de polices externe : ${providers[0]}`,
      }
    }
    return {
      score: count >= 3 ? 20 : 40,
      status: count >= 3 ? 'critical' : 'warning',
      details: { externalFontProviders: count, providers },
      recommendations: [
        `${count} sources de polices externes (${providers.join(', ')}). Chaque source ajoute une connexion et ralentit le rendu. Réduire à 1 famille maximum, auto-héberger avec font-display: swap.`,
      ],
      summary: `${count} sources de polices externes — impact performance et empreinte`,
    }
  },
}
