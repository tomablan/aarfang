import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const viewportMeta: Signal = {
  id: 'viewport_meta',
  category: 'technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const viewport = $('meta[name="viewport"]').attr('content') ?? null

    if (!viewport) {
      return {
        score: 0, status: 'critical',
        details: { viewport: null },
        recommendations: ['Balise viewport manquante. Ajouter <meta name="viewport" content="width=device-width, initial-scale=1"> pour le responsive.'],
        summary: 'Balise viewport absente — site non responsive',
      }
    }
    const hasWidthDevice = viewport.includes('width=device-width')
    if (!hasWidthDevice) {
      return {
        score: 50, status: 'warning',
        details: { viewport },
        recommendations: [`La balise viewport ne contient pas "width=device-width". Valeur actuelle : "${viewport}".`],
        summary: `viewport="${viewport}" — width=device-width manquant`,
      }
    }
    return { score: 100, status: 'good', details: { viewport }, recommendations: [], summary: `viewport="${viewport}"` }
  },
}
