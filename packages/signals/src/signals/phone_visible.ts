import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Détecte les numéros de téléphone FR et internationaux
const PHONE_REGEX = /(?:\+33|0033|0)[1-9](?:[\s.\-]?\d{2}){4}|(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{1,4}\)?[\s.\-]?)?\d{6,14}/g

export const phoneVisible: Signal = {
  id: 'phone_visible',
  category: 'opportunites',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // Chercher les liens tel:
    const telLinks = $('a[href^="tel:"]').map((_, el) => $(el).attr('href')?.replace('tel:', '') ?? '').get()

    // Chercher dans le texte visible
    const bodyText = $('body').text()
    const textMatches = bodyText.match(PHONE_REGEX) ?? []

    const allPhones = [...new Set([...telLinks, ...textMatches])].slice(0, 5)

    if (allPhones.length === 0) {
      return {
        score: 20,
        status: 'warning',
        details: { phones: [] },
        recommendations: ['Aucun numéro de téléphone visible. Afficher un numéro cliquable (tel:) pour faciliter le contact.'],
        summary: 'Aucun numéro de téléphone détecté',
      }
    }
    const hasClickable = telLinks.length > 0
    return {
      score: hasClickable ? 100 : 70,
      status: hasClickable ? 'good' : 'warning',
      details: { phones: allPhones, hasClickableLink: hasClickable },
      recommendations: hasClickable ? [] : ['Rendre le numéro de téléphone cliquable avec un lien tel:.'],
      summary: `${allPhones[0]}${hasClickable ? ' (lien tel: cliquable)' : ' (non cliquable)'}`,
    }
  },
}
