import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const geoAuthorExpertise: Signal = {
  id: 'geo_author_expertise',
  category: 'geo',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()
    const bodyText = $('body').text().toLowerCase()

    // ── 1. Liens vers page "À propos" / "Équipe" dans la nav ──
    const aboutKeywords = [
      'à propos', 'a propos', 'about', 'qui sommes-nous', 'qui nous sommes',
      'notre équipe', 'notre equipe', 'l\'équipe', 'l\'agence', 'notre agence',
      'notre histoire', 'about us', 'team',
    ]
    const navLinks: string[] = []
    $('nav a, header a, footer a').each((_, el) => {
      navLinks.push(($(el).text().toLowerCase().trim() + ' ' + ($(el).attr('href') ?? '')).toLowerCase())
    })
    const hasAboutNav = aboutKeywords.some((kw) => navLinks.some((l) => l.includes(kw)))

    // ── 2. Biographies d'auteurs ──
    const authorSelectors = [
      '[class*="author"]', '[class*="auteur"]', '[rel="author"]',
      '[class*="bio"]', '[class*="biographie"]',
      '[itemprop="author"]', '[class*="team-member"]', '[class*="membre"]',
    ]
    let hasAuthorBio = false
    for (const sel of authorSelectors) {
      try { if ($(sel).length > 0) { hasAuthorBio = true; break } } catch {}
    }

    // ── 3. Mentions d'expérience quantifiée ──
    const experiencePatterns = [
      /\d+\s*ans?\s*d['']expérience/i,
      /depuis\s*\d{4}/i,
      /\d+\s*years?\s*of\s*experience/i,
      /fondé\s*en\s*\d{4}/i,
      /créé\s*en\s*\d{4}/i,
      /expert\s*depuis/i,
    ]
    const hasExperienceMention = experiencePatterns.some((re) => re.test(bodyText))

    // ── 4. Schema.org Person ou Organization avec détails ──
    let hasPersonSchema = false
    let hasOrgDetails = false
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}')
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item['@type'] === 'Person' && (item.name || item.jobTitle)) hasPersonSchema = true
          if (['Organization', 'LocalBusiness'].includes(item['@type']) && item.description) hasOrgDetails = true
        }
      } catch {}
    })

    // ── 5. Photos d'équipe ──
    let hasTeamPhoto = false
    $('img').each((_, el) => {
      const alt = ($(el).attr('alt') ?? '').toLowerCase()
      const src = ($(el).attr('src') ?? '').toLowerCase()
      if (
        alt.includes('équipe') || alt.includes('equipe') || alt.includes('team') ||
        alt.includes('fondateur') || alt.includes('directeur') || alt.includes('auteur') ||
        src.includes('team') || src.includes('equipe') || src.includes('author')
      ) hasTeamPhoto = true
    })

    // ── Scoring ──
    const signals = { hasAboutNav, hasAuthorBio, hasExperienceMention, hasPersonSchema, hasOrgDetails, hasTeamPhoto }
    const score = [hasAboutNav, hasAuthorBio, hasExperienceMention, hasPersonSchema || hasOrgDetails, hasTeamPhoto]
      .filter(Boolean).length

    if (score >= 4) {
      return {
        score: 100, status: 'good',
        details: signals,
        recommendations: [],
        summary: 'Expertise et expérience des auteurs bien mis en avant',
      }
    }
    if (score === 3) {
      return {
        score: 80, status: 'good',
        details: signals,
        recommendations: [
          !hasPersonSchema && !hasOrgDetails ? 'Ajoutez un schema.org Person ou Organization avec description pour renforcer l\'autorité perçue par les moteurs d\'IA.' : '',
          !hasAuthorBio ? 'Une courte biographie d\'auteur sous chaque article ou page de service renforce la crédibilité E-E-A-T.' : '',
        ].filter(Boolean),
        summary: 'Bonne crédibilité auteur — quelques optimisations possibles',
      }
    }
    if (score === 2) {
      return {
        score: 55, status: 'warning',
        details: signals,
        recommendations: [
          'Créez une page "À propos" ou "Équipe" détaillée — c\'est le premier signal d\'expérience que les LLMs et Google E-E-A-T évaluent.',
          'Ajoutez des mentions d\'expérience quantifiées (X ans dans le secteur, fondé en XXXX) dans votre présentation.',
          'Un schema.org Person avec nom, titre et photo renforce votre autorité auprès des moteurs génératifs.',
        ],
        summary: 'Crédibilité auteur partielle',
      }
    }
    if (score === 1) {
      return {
        score: 25, status: 'critical',
        details: signals,
        recommendations: [
          'Aucune page "À propos" ou biographie d\'auteur détectée — les moteurs d\'IA (ChatGPT, Perplexity, Google SGE) privilégient les sources dont l\'auteur et l\'expérience sont clairement identifiés.',
          'Ajoutez une section "Qui sommes-nous" avec noms, fonctions et parcours de l\'équipe.',
          'Mentionnez explicitement le nombre d\'années d\'expérience ou l\'année de création de votre activité.',
        ],
        summary: 'Expertise non identifiable (E-E-A-T faible)',
      }
    }

    return {
      score: 10, status: 'critical',
      details: signals,
      recommendations: [
        'Aucun signal d\'expertise ou d\'expérience détecté — les LLMs ne citeront pas une source anonyme sans crédibilité établie.',
        'Créez une page "À propos" complète : nom de l\'entreprise, fondateurs, mission, expérience sectorielle.',
        'Ajoutez des biographies d\'auteurs sur vos articles et pages de service.',
        'Implémentez un schema.org Organization ou Person avec tous les champs disponibles.',
      ],
      summary: 'Aucun signal d\'expertise ou d\'expérience (E)',
    }
  },
}
