import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Domaines considérés comme sources de référence
const AUTHORITY_PATTERNS = [
  // Gouvernement et institutions
  /\.gouv\.fr$/i, /\.gov$/i, /\.europa\.eu$/i, /\.who\.int$/i,
  /service-public\.fr$/i, /legifrance\.gouv\.fr$/i,
  // Académique et recherche
  /\.edu$/i, /hal\.science$/i, /hal\.fr$/i, /pubmed\.ncbi\.nlm\.nih\.gov$/i,
  /doi\.org$/i, /scholar\.google/i, /researchgate\.net$/i,
  // Encyclopédies et références
  /wikipedia\.org$/i, /britannica\.com$/i, /larousse\.fr$/i,
  // Médias de référence nationaux
  /lemonde\.fr$/i, /lefigaro\.fr$/i, /liberation\.fr$/i, /lepoint\.fr$/i,
  /lesechos\.fr$/i, /bfmtv\.com$/i, /francetvinfo\.fr$/i,
  // Santé
  /ameli\.fr$/i, /has-sante\.fr$/i, /vidal\.fr$/i,
  // Droit et normes
  /iso\.org$/i, /afnor\.org$/i, /cnil\.fr$/i,
]

function isAuthorityDomain(href: string): boolean {
  try {
    const url = new URL(href)
    return AUTHORITY_PATTERNS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

export const geoExternalSources: Signal = {
  id: 'geo_external_sources',
  category: 'geo',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const siteHostname = (() => {
      try { return new URL(ctx.site.url).hostname } catch { return '' }
    })()

    const authorityLinks: string[] = []
    const allExternalLinks: string[] = []

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      if (!href.startsWith('http')) return
      try {
        const linkHostname = new URL(href).hostname
        if (linkHostname === siteHostname) return // lien interne
        allExternalLinks.push(href)
        if (isAuthorityDomain(href)) authorityLinks.push(href)
      } catch {}
    })

    // Dédupliquer par hostname
    const uniqueAuthorityDomains = [...new Set(authorityLinks.map((h) => {
      try { return new URL(h).hostname } catch { return h }
    }))]

    const count = uniqueAuthorityDomains.length
    const details = {
      authorityLinks: uniqueAuthorityDomains.slice(0, 10),
      authorityCount: count,
      externalLinksTotal: allExternalLinks.length,
    }

    if (count >= 5) {
      return {
        score: 100, status: 'good',
        details,
        recommendations: [],
        summary: `${count} sources de référence citées — excellent signal de fiabilité`,
      }
    }

    if (count >= 3) {
      return {
        score: 80, status: 'good',
        details,
        recommendations: [
          'Continuez à citer des sources officielles et académiques — chaque lien sortant vers une référence d\'autorité renforce votre crédibilité E-E-A-T.',
        ],
        summary: `${count} sources d'autorité citées`,
      }
    }

    if (count >= 1) {
      return {
        score: 50, status: 'warning',
        details,
        recommendations: [
          `Seulement ${count} source(s) d'autorité détectée(s) — les LLMs et Google évaluent la fiabilité d'une page à travers ses citations vers des sources vérifiables.`,
          'Citez les textes de loi, études, rapports officiels ou données gouvernementales qui soutiennent vos affirmations.',
          'Wikipedia, les sites .gouv.fr, .edu et les publications scientifiques (DOI) sont particulièrement valorisés.',
        ],
        summary: `${count} source d'autorité citée`,
      }
    }

    return {
      score: 10, status: 'critical',
      details,
      recommendations: [
        'Aucune source externe de référence détectée — un contenu sans citations vers des sources vérifiables est perçu comme peu fiable par les moteurs d\'IA (critère Trustworthiness de l\'E-E-A-T).',
        'Ajoutez des liens vers des sources gouvernementales (.gouv.fr), académiques (.edu), Wikipedia ou des publications sectorielles de référence.',
        'Citez explicitement les données chiffrées avec leur source : "selon l\'INSEE (2024), …" suivi d\'un lien.',
        'Les pages avec des liens sortants vers des sources de qualité sont 3× plus susceptibles d\'être citées dans les réponses des LLMs.',
      ],
      summary: 'Aucune source externe d\'autorité citée (Trustworthiness faible)',
    }
  },
}
