import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const canonicalTag: Signal = {
  id: 'canonical_tag',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const canonicals = $('link[rel="canonical"]').map((_, el) => $(el).attr('href')).get()
    const count = canonicals.length

    if (count === 0) {
      return { score: 40, status: 'warning', details: { count, canonicals: [] }, recommendations: ['Ajouter une balise canonical pour éviter le duplicate content.'], summary: 'Balise canonical absente' }
    }
    if (count > 1) {
      return { score: 30, status: 'critical', details: { count, canonicals }, recommendations: ['Plusieurs balises canonical détectées — en garder une seule.'], summary: `${count} canonicals conflictuels détectés` }
    }
    const url = canonicals[0] ?? ''
    const display = url.length > 60 ? url.slice(0, 57) + '…' : url
    return { score: 100, status: 'good', details: { count, canonical: url }, recommendations: [], summary: display }
  },
}
