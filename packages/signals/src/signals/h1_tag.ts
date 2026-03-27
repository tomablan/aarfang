import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const h1Tag: Signal = {
  id: 'h1_tag',
  category: 'seo_technique',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const h1s = $('h1').map((_, el) => $(el).text().trim()).get()
    const count = h1s.length

    if (count === 0) {
      return { score: 0, status: 'critical', details: { count, h1s: [] }, recommendations: ['Ajouter un H1 unique et pertinent à la page.'], summary: 'Aucune balise H1 trouvée' }
    }
    if (count > 1) {
      return { score: 50, status: 'warning', details: { count, h1s }, recommendations: [`${count} balises H1 détectées. Il ne doit y en avoir qu'une seule par page.`], summary: `${count} H1 détectés : «${h1s[0].slice(0, 40)}»…` }
    }
    const h1 = h1s[0]
    const preview = h1.length > 60 ? h1.slice(0, 57) + '…' : h1
    if (h1.length < 10) {
      return { score: 60, status: 'warning', details: { count, h1s }, recommendations: ['Le H1 est très court. Rendre le titre plus descriptif.'], summary: `«${preview}» — ${h1.length} car. (trop court)` }
    }
    return { score: 100, status: 'good', details: { count, h1s }, recommendations: [], summary: `«${preview}»` }
  },
}
