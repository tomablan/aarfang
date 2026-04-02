import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const pricingPage: Signal = {
  id: 'pricing_page',
  category: 'opportunites',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // ── 1. Lien vers une page tarifs dans la navigation ──
    const pricingNavKeywords = [
      'tarif', 'tarifs', 'prix', 'pricing', 'offres', 'abonnement',
      'forfait', 'plans', 'formules',
    ]
    const navLinks: string[] = []
    $('nav a, header a').each((_, el) => {
      const text = $(el).text().toLowerCase().trim()
      const href = ($(el).attr('href') ?? '').toLowerCase()
      navLinks.push(text + ' ' + href)
    })
    const hasPricingNav = pricingNavKeywords.some((kw) =>
      navLinks.some((l) => l.includes(kw))
    )

    // ── 2. Chemins URL courants pour une page tarifs ──
    const pricingUrlPatterns = [
      '/tarifs', '/tarif', '/pricing', '/prix', '/offres',
      '/abonnements', '/forfaits', '/plans',
    ]
    const hasPricingUrl = pricingUrlPatterns.some((p) => html.includes(p))

    // ── 3. Contenu tarifaire en page (grilles, tableaux de prix) ──
    const pricingContentKeywords = [
      '€/mois', '€ /mois', 'ht/mois', '€/an', 'par mois', 'par an',
      '/month', '/year', 'per month',
    ]
    const hasPricingContent = pricingContentKeywords.some((kw) => html.includes(kw))

    // ── 4. Schema.org Offer / PriceSpecification ──
    let hasPricingSchema = false
    $('script[type="application/ld+json"]').each((_, el) => {
      const content = ($(el).html() ?? '').toLowerCase()
      if (content.includes('"offer"') || content.includes('"pricespecification"')) {
        hasPricingSchema = true
      }
    })

    // ── 5. Tableaux de comparaison de formules ──
    const hasPricingTable =
      $('table').length > 0 && pricingNavKeywords.some((kw) => html.includes(kw))

    const detected = hasPricingNav || hasPricingUrl || hasPricingContent || hasPricingSchema || hasPricingTable

    if (detected) {
      return {
        score: 100,
        status: 'good',
        details: { hasPricingNav, hasPricingUrl, hasPricingContent, hasPricingSchema, hasPricingTable },
        recommendations: [],
        summary: 'Page tarifs / transparence tarifaire détectée',
      }
    }

    return {
      score: 20,
      status: 'critical',
      details: { detected: false },
      recommendations: [
        '87% des acheteurs B2B consultent les tarifs avant de contacter un commercial — l\'absence d\'une page prix oblige le prospect à aller comparer chez un concurrent.',
        'Même sans prix fixes, une page "Nos formules" avec des fourchettes ou un "À partir de X€" rassure et pré-qualifie les leads entrants.',
        'Une page tarifs bien structurée se positionne naturellement sur des requêtes à forte intention d\'achat ("prix [service] [ville]") sans budget SEA supplémentaire.',
      ],
      summary: 'Aucune page tarifs détectée',
    }
  },
}
