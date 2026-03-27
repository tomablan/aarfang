import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const metaDescription: Signal = {
  id: 'meta_description',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const desc = $('meta[name="description"]').attr('content')?.trim() ?? ''
    const length = desc.length

    if (!desc) {
      return { score: 0, status: 'critical', details: { description: null, length: 0 }, recommendations: ['Ajouter une meta description unique et engageante (150–160 caractères).'], summary: 'Meta description absente' }
    }
    const preview = desc.length > 80 ? desc.slice(0, 77) + '…' : desc
    if (length < 70) {
      return { score: 50, status: 'warning', details: { description: desc, length }, recommendations: [`Meta description trop courte (${length} car.). Viser 150–160 caractères.`], summary: `«${preview}» — ${length} car. (trop courte, min 70)` }
    }
    if (length > 160) {
      return { score: 70, status: 'warning', details: { description: desc, length }, recommendations: [`Meta description trop longue (${length} car.). Elle sera tronquée. Viser 150–160 caractères.`], summary: `«${preview}» — ${length} car. (trop longue, max 160)` }
    }
    return { score: 100, status: 'good', details: { description: desc, length }, recommendations: [], summary: `«${preview}» — ${length} car.` }
  },
}
