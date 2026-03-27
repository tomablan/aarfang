import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const metaTitle: Signal = {
  id: 'meta_title',
  category: 'seo_technique',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const title = $('title').first().text().trim()
    const length = title.length

    if (!title) {
      return { score: 0, status: 'critical', details: { title: null, length: 0 }, recommendations: ['Ajouter une balise <title> unique et descriptive à la page.'], summary: 'Balise <title> absente' }
    }
    const preview = title.length > 60 ? title.slice(0, 57) + '…' : title
    if (length < 30) {
      return { score: 50, status: 'warning', details: { title, length }, recommendations: [`La balise <title> est trop courte (${length} caractères). Viser 50–60 caractères.`], summary: `«${preview}» — ${length} car. (trop court, min 30)` }
    }
    if (length > 60) {
      return { score: 70, status: 'warning', details: { title, length }, recommendations: [`La balise <title> est trop longue (${length} caractères). Elle sera tronquée dans les SERP. Viser 50–60 caractères.`], summary: `«${preview}» — ${length} car. (trop long, max 60)` }
    }
    return { score: 100, status: 'good', details: { title, length }, recommendations: [], summary: `«${preview}» — ${length} car.` }
  },
}
