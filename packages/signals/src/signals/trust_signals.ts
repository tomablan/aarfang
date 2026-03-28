import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Patterns HTML pour chaque type de signal de confiance
const CHECKS = {
  testimonials: {
    label: 'Témoignages clients',
    selectors: [
      '[class*="testimoni"]', '[id*="testimoni"]',
      '[class*="avis"]', '[id*="avis"]',
      '[class*="review"]', '[id*="review"]',
      '[class*="temoignage"]', '[id*="temoignage"]',
      '[class*="customer"]', '[class*="client"]',
      '[class*="feedback"]',
    ],
    textKeywords: ['témoignage', 'ils nous font confiance', 'nos clients', 'ce que disent', 'avis clients', 'ce qu\'ils disent'],
  },
  clientLogos: {
    label: 'Logos clients / partenaires',
    selectors: [
      '[class*="partner"]', '[id*="partner"]',
      '[class*="partenaire"]', '[id*="partenaire"]',
      '[class*="client-logo"]', '[class*="clients-logo"]',
      '[class*="reference"]', '[id*="reference"]',
      '[class*="brand"]', '[class*="logo-client"]',
    ],
    textKeywords: ['ils nous font confiance', 'nos partenaires', 'nos références', 'clients de confiance'],
  },
  paymentBadges: {
    label: 'Badges paiement sécurisé',
    selectors: [
      '[class*="payment"]', '[class*="paiement"]',
      '[class*="secure"]', '[class*="securis"]',
      '[class*="checkout"]',
    ],
    textKeywords: ['paiement sécurisé', 'secure payment', 'visa', 'mastercard', 'paypal', '3d secure', 'ssl'],
    imageAltKeywords: ['visa', 'mastercard', 'paypal', 'stripe', 'paiement'],
  },
  certifications: {
    label: 'Certifications / labels',
    selectors: [
      '[class*="certif"]', '[id*="certif"]',
      '[class*="label"]', '[class*="award"]',
      '[class*="badge"]', '[class*="garantie"]',
    ],
    textKeywords: ['certifié', 'certification', 'labellisé', 'agrément', 'norme iso', 'rge', 'qualiopi', 'nf'],
  },
  guarantees: {
    label: 'Garanties / engagements',
    selectors: [
      '[class*="garantie"]', '[class*="guarantee"]',
      '[class*="engagement"]', '[class*="promesse"]',
      '[class*="warranty"]',
    ],
    textKeywords: ['satisfait ou remboursé', 'garantie', 'sans engagement', 'remboursement', 'retour gratuit', '30 jours'],
  },
}

type CheckKey = keyof typeof CHECKS

function detectCheck($: ReturnType<typeof load>, check: typeof CHECKS[CheckKey]): boolean {
  // Vérification par sélecteur CSS
  for (const selector of check.selectors) {
    try {
      if ($(selector).length > 0) return true
    } catch {}
  }

  const bodyText = $('body').text().toLowerCase()

  // Vérification par mot-clé dans le texte
  if (check.textKeywords.some((kw) => bodyText.includes(kw.toLowerCase()))) return true

  // Vérification dans les attributs alt des images (pour badges paiement)
  if ('imageAltKeywords' in check && check.imageAltKeywords) {
    let found = false
    $('img[alt]').each((_, el) => {
      if (found) return
      const alt = ($('img').attr('alt') ?? '').toLowerCase()
      if ((check as typeof CHECKS['paymentBadges']).imageAltKeywords!.some((kw) => alt.includes(kw))) found = true
    })
    if (found) return true
  }

  return false
}

export const trustSignals: Signal = {
  id: 'trust_signals',
  category: 'opportunites',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    const results = Object.fromEntries(
      (Object.entries(CHECKS) as [CheckKey, typeof CHECKS[CheckKey]][]).map(([key, check]) => [
        key,
        { detected: detectCheck($, check), label: check.label },
      ])
    ) as Record<CheckKey, { detected: boolean; label: string }>

    const detected = (Object.entries(results) as [CheckKey, { detected: boolean; label: string }][])
      .filter(([, v]) => v.detected)
      .map(([, v]) => v.label)

    const missing = (Object.entries(results) as [CheckKey, { detected: boolean; label: string }][])
      .filter(([, v]) => !v.detected)
      .map(([, v]) => v.label)

    const count = detected.length
    const total = Object.keys(CHECKS).length
    const recommendations: string[] = []

    if (!results.testimonials.detected) {
      recommendations.push('Ajouter une section témoignages clients — c\'est le signal de confiance le plus efficace pour convertir un visiteur hésitant.')
    }
    if (!results.clientLogos.detected) {
      recommendations.push('Afficher les logos de clients ou partenaires connus renforce immédiatement la crédibilité.')
    }
    if (ctx.site.isEcommerce && !results.paymentBadges.detected) {
      recommendations.push('Aucun badge de paiement sécurisé détecté — les afficher réduit l\'abandon panier.')
    }
    if (!results.guarantees.detected) {
      recommendations.push('Mettre en avant une garantie (satisfait ou remboursé, sans engagement…) lève les dernières hésitations à l\'achat.')
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'
    const ratio = count / total
    if (ratio >= 0.8) { score = 100; status = 'good' }
    else if (ratio >= 0.6) { score = 80; status = 'good' }
    else if (ratio >= 0.4) { score = 55; status = 'warning' }
    else if (ratio >= 0.2) { score = 30; status = 'critical' }
    else { score = 5; status = 'critical' }

    return {
      score,
      status,
      details: { detected, missing, count, total },
      recommendations,
      summary: count === 0
        ? 'Aucun signal de confiance détecté'
        : `${count}/${total} signaux : ${detected.join(', ')}`,
    }
  },
}
