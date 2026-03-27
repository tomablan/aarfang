import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const structuredData: Signal = {
  id: 'structured_data',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const scripts = $('script[type="application/ld+json"]')
    const count = scripts.length

    if (count === 0) {
      return {
        score: 20, status: 'warning',
        details: { count: 0, types: [] },
        recommendations: ['Aucune donnée structurée JSON-LD détectée. Ajouter un schema.org approprié (Organization, LocalBusiness, WebPage…) pour enrichir les résultats de recherche.'],
        summary: 'Aucune donnée structurée JSON-LD détectée',
      }
    }

    const types: string[] = []
    let validCount = 0

    scripts.each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? '')
        const type = json['@type'] ?? (Array.isArray(json) ? json[0]?.['@type'] : null)
        if (type) types.push(type)
        validCount++
      } catch {
        // JSON invalide
      }
    })

    if (validCount === 0) {
      return {
        score: 10, status: 'critical',
        details: { count, validCount: 0, types: [] },
        recommendations: ['Des balises JSON-LD sont présentes mais contiennent du JSON invalide. Les corriger.'],
        summary: `${count} balise(s) JSON-LD présentes mais JSON invalide`,
      }
    }

    const hasLocalBusiness = types.some((t) => ['LocalBusiness', 'Organization', 'Store', 'Restaurant'].includes(t))
    const score = hasLocalBusiness ? 100 : 80
    return {
      score, status: 'good',
      details: { count, validCount, types },
      recommendations: hasLocalBusiness ? [] : ['Envisager d\'ajouter un schema LocalBusiness ou Organization pour améliorer le SEO local.'],
      summary: `${validCount} schema(s) : ${types.join(', ')}`,
    }
  },
}
