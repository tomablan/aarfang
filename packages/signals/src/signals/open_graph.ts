import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const OG_TAGS = [
  { property: 'og:title', label: 'og:title' },
  { property: 'og:description', label: 'og:description' },
  { property: 'og:image', label: 'og:image' },
  { property: 'og:url', label: 'og:url' },
]

export const openGraph: Signal = {
  id: 'open_graph',
  category: 'seo_technique',
  weight: 1,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const present: string[] = []
    const missing: string[] = []
    const values: Record<string, string> = {}

    for (const tag of OG_TAGS) {
      const content = $(`meta[property="${tag.property}"]`).attr('content')?.trim()
      if (content) {
        present.push(tag.label)
        values[tag.property] = content.slice(0, 100)
      } else {
        missing.push(tag.label)
      }
    }

    const score = Math.round((present.length / OG_TAGS.length) * 100)
    const status = score === 100 ? 'good' : score >= 50 ? 'warning' : 'critical'
    const recommendations = missing.length > 0
      ? [`Balises Open Graph manquantes : ${missing.join(', ')}. Indispensables pour le partage sur les réseaux sociaux.`]
      : []

    const summary = missing.length === 0
      ? `Tous les tags OG présents : ${present.join(', ')}`
      : `Absents : ${missing.join(', ')} · Présents : ${present.join(', ')}`
    return { score, status, details: { present, missing, values }, recommendations, summary }
  },
}
