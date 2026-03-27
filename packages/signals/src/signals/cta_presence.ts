import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const CTA_PATTERNS = [
  /contact/i, /devis/i, /demo/i, /essai/i, /commencer/i,
  /appel/i, /appeler/i, /rdv/i, /rendez-vous/i, /inscription/i,
  /s['']inscrire/i, /télécharger/i, /telecharger/i,
  /get started/i, /free trial/i, /sign up/i, /book/i, /request/i,
]

export const ctaPresence: Signal = {
  id: 'cta_presence',
  category: 'opportunites',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const ctasFound: string[] = []

    $('a, button').each((_, el) => {
      const text = $(el).text().trim()
      if (CTA_PATTERNS.some((p) => p.test(text))) {
        ctasFound.push(text.slice(0, 80))
      }
    })

    const count = ctasFound.length
    if (count === 0) {
      return { score: 0, status: 'critical', details: { count, ctasFound: [] }, recommendations: ['Aucun CTA détecté. Ajouter des appels à l\'action clairs (contact, devis, démo).'], summary: 'Aucun CTA détecté' }
    }
    if (count === 1) {
      return { score: 70, status: 'warning', details: { count, ctasFound }, recommendations: ['Un seul CTA détecté. Diversifier les points de conversion sur la page.'], summary: `1 CTA : «${ctasFound[0]}»` }
    }
    return { score: 100, status: 'good', details: { count, ctasFound: ctasFound.slice(0, 5) }, recommendations: [], summary: `${count} CTAs : ${ctasFound.slice(0, 3).map((c) => `«${c}»`).join(', ')}` }
  },
}
