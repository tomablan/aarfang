import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

interface LegalLink {
  href: string
  text: string
}

// Patterns de détection pour chaque type de page légale
const LEGAL_PATTERNS = {
  mentionsLegales: {
    label: 'Mentions légales',
    href: ['mentions-legales', 'mentions_legales', 'mentions%20legales', 'legal', 'informations-legales'],
    text: ['mentions légales', 'mentions legales', 'informations légales'],
  },
  confidentialite: {
    label: 'Politique de confidentialité',
    href: ['confidentialite', 'politique-de-confidentialite', 'politique-confidentialite', 'privacy', 'privacy-policy', 'donnees-personnelles', 'rgpd', 'gdpr'],
    text: ['confidentialité', 'politique de confidentialité', 'données personnelles', 'rgpd', 'gdpr', 'privacy'],
  },
  cgu: {
    label: 'CGU',
    href: ['cgu', 'conditions-generales', 'conditions-generales-utilisation', 'conditions-dutilisation', 'terms', 'terms-of-service', 'tos'],
    text: ['conditions générales', 'cgu', 'conditions d\'utilisation', 'terms of service'],
  },
  cgv: {
    label: 'CGV',
    href: ['cgv', 'conditions-generales-vente', 'conditions-de-vente', 'terms-of-sale'],
    text: ['conditions générales de vente', 'cgv', 'conditions de vente'],
  },
}

function detectLegalLink($: ReturnType<typeof load>, patterns: typeof LEGAL_PATTERNS[keyof typeof LEGAL_PATTERNS]): LegalLink | null {
  let found: LegalLink | null = null

  $('a[href]').each((_, el) => {
    if (found) return
    const href = ($( el).attr('href') ?? '').toLowerCase()
    const text = ($(el).text() ?? '').toLowerCase().trim()

    const hrefMatch = patterns.href.some((p) => href.includes(p))
    const textMatch = patterns.text.some((p) => text.includes(p))

    if (hrefMatch || textMatch) {
      found = { href: $(el).attr('href') ?? '', text: $(el).text().trim() }
    }
  })

  return found
}

export const legalPages: Signal = {
  id: 'legal_pages',
  category: 'conformite',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    const mentionsLegales = detectLegalLink($, LEGAL_PATTERNS.mentionsLegales)
    const confidentialite = detectLegalLink($, LEGAL_PATTERNS.confidentialite)
    const cgu = detectLegalLink($, LEGAL_PATTERNS.cgu)
    const cgv = ctx.site.isEcommerce ? detectLegalLink($, LEGAL_PATTERNS.cgv) : null

    const details = {
      mentionsLegales: mentionsLegales ? { found: true, href: mentionsLegales.href } : { found: false },
      confidentialite: confidentialite ? { found: true, href: confidentialite.href } : { found: false },
      cgu: cgu ? { found: true, href: cgu.href } : { found: false },
      ...(ctx.site.isEcommerce ? { cgv: cgv ? { found: true, href: cgv.href } : { found: false } } : {}),
    }

    const recommendations: string[] = []
    const found: string[] = []
    const missing: string[] = []

    if (mentionsLegales) { found.push('Mentions légales') }
    else {
      missing.push('Mentions légales')
      recommendations.push('Les mentions légales sont obligatoires en France pour tout site web professionnel (art. 6 LCEN) — leur absence expose à une amende de 75 000 €.')
    }

    if (confidentialite) { found.push('Politique de confidentialité') }
    else {
      missing.push('Politique de confidentialité')
      recommendations.push('La politique de confidentialité est requise par le RGPD dès que le site collecte des données personnelles (formulaire, cookies analytiques…).')
    }

    if (cgu) found.push('CGU')
    if (cgv) found.push('CGV')

    const hasMandatory = !!mentionsLegales && !!confidentialite
    const hasOneMandatory = !!mentionsLegales || !!confidentialite
    const mandatoryMissing = missing.filter((m) => m === 'Mentions légales' || m === 'Politique de confidentialité')
    const cgvMissing = ctx.site.isEcommerce && !cgv

    if (cgvMissing) {
      recommendations.push('Les CGV sont obligatoires pour tout site e-commerce en France (art. L441-1 Code de commerce) — leur absence expose à une amende de 15 000 €.')
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'
    let summary: string

    if (!hasMandatory && !hasOneMandatory) {
      score = 0
      status = 'critical'
      summary = 'Mentions légales et politique de confidentialité absentes'
    } else if (!hasMandatory) {
      score = 40
      status = 'critical'
      summary = `Manquant : ${mandatoryMissing.join(', ')}`
    } else if (cgvMissing) {
      // Mentions légales + confidentialité OK mais CGV absentes sur e-commerce
      score = 60
      status = 'warning'
      summary = `CGV manquantes${found.length > 0 ? ' · ' + found.join(' · ') : ''}`
    } else {
      score = 100
      status = 'good'
      summary = found.join(' · ')
    }

    return { score, status, details, recommendations, summary }
  },
}
