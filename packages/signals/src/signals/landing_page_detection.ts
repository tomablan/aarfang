import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Patterns d'URL caractéristiques des landing pages dédiées
const LANDING_URL_PATTERNS = [
  '/lp/', '/landing', '/campagne', '/campaign', '/acquisition',
  '/offre', '/promo', '/promotion', '/leads', '/lead',
  '/demo', '/démo', '/essai', '/trial', '/devis',
  '/gratuit', '/free', '/telechargement', '/download',
  '/inscription-', '/register-', '/signup-',
]

// Mots-clés dans les liens qui indiquent une page de conversion dédiée
const CONVERSION_LINK_KEYWORDS = [
  'demander une démo', 'demander une demo', 'essai gratuit', 'démo gratuite',
  'demo gratuite', 'devis gratuit', 'obtenir un devis', 'accès gratuit',
  'commencer gratuitement', 'tester gratuitement', 'réserver une démo',
  'book a demo', 'get started', 'free trial', 'start free',
]

export const landingPageDetection: Signal = {
  id: 'landing_page_detection',
  category: 'sea',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // ── 1. Analyse des données de crawl (source la plus fiable) ──
    let crawlLandingPages: string[] = []
    let crawlOrphanConversionPages: string[] = []

    if (ctx.crawl) {
      // 1a. Pages avec URL explicitement landing
      crawlLandingPages = ctx.crawl.rows
        .filter((row) => LANDING_URL_PATTERNS.some((pat) => row.url.toLowerCase().includes(pat)))
        .map((row) => row.url)

      // 1b. Pages "orphelines de navigation" avec forte chance d'être des landing SEA :
      //     - peu de liens entrants (≤2 = pas dans le menu principal)
      //     - noindex (classic pattern : noindex pour éviter la canibalisation SEO)
      //     - ou titre contenant des mots de conversion
      const conversionTitleKeywords = ['démo', 'demo', 'essai', 'trial', 'devis', 'offre', 'promo', 'télécharger', 'download']
      crawlOrphanConversionPages = ctx.crawl.rows
        .filter((row) =>
          row.inlinks <= 2 &&
          row.statusCode === 200 &&
          row.url !== ctx.site.url &&
          (!row.indexable || conversionTitleKeywords.some((kw) => row.title.toLowerCase().includes(kw)))
        )
        .map((row) => row.url)
        .slice(0, 10) // limiter l'affichage
    }

    const hasCrawlEvidence = crawlLandingPages.length > 0 || crawlOrphanConversionPages.length > 0
    const totalCrawlLandings = crawlLandingPages.length + crawlOrphanConversionPages.length

    // ── 2. Analyse de la homepage — liens vers des pages de conversion dédiées ──

    // 2a. Liens dont le texte indique une conversion forte
    const conversionLinks: string[] = []
    $('a[href]').each((_, el) => {
      const text = $(el).text().toLowerCase().trim()
      const href = $(el).attr('href') ?? ''
      const isExternal = href.startsWith('http') && !href.includes(new URL(ctx.site.url).hostname)
      if (!isExternal && CONVERSION_LINK_KEYWORDS.some((kw) => text.includes(kw))) {
        conversionLinks.push(href)
      }
    })

    // 2b. Liens internes vers des URL de type landing
    const landingLinks: string[] = []
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').toLowerCase()
      if (LANDING_URL_PATTERNS.some((pat) => href.includes(pat))) {
        landingLinks.push(href)
      }
    })

    // 2c. La homepage elle-même ressemble-t-elle à une landing (pas de nav, form + CTA) ?
    const hasNoMainNav = $('nav').length === 0 && $('header nav, .nav, #nav, #menu, .menu').length === 0
    const hasPrimaryForm = $('form').length > 0
    const hasPrimaryButton = $('button[type="submit"], input[type="submit"], a.btn, a.button, .cta').length > 0
    const homepageIsLanding = hasNoMainNav && hasPrimaryForm && hasPrimaryButton

    // 2d. Références UTM dans les liens (preuve de campagnes avec pages dédiées)
    const hasUtmLinks = html.includes('utm_source=') || html.includes('utm_campaign=')

    const hasHomepageEvidence = conversionLinks.length > 0 || landingLinks.length > 0 || homepageIsLanding

    // ── Scoring ──

    if (hasCrawlEvidence && totalCrawlLandings >= 3) {
      return {
        score: 100,
        status: 'good',
        details: {
          crawlLandingPages: crawlLandingPages.slice(0, 5),
          crawlOrphanConversionPages: crawlOrphanConversionPages.slice(0, 5),
          totalDetected: totalCrawlLandings,
          hasUtmLinks,
        },
        recommendations: [],
        summary: `${totalCrawlLandings} landing page${totalCrawlLandings > 1 ? 's' : ''} de conversion détectée${totalCrawlLandings > 1 ? 's' : ''}`,
      }
    }

    if (hasCrawlEvidence || hasHomepageEvidence) {
      const evidence = hasCrawlEvidence
        ? `${totalCrawlLandings} page${totalCrawlLandings > 1 ? 's' : ''} identifiée${totalCrawlLandings > 1 ? 's' : ''} (peu de liens entrants)`
        : conversionLinks.length > 0
          ? `Liens de conversion détectés (${conversionLinks[0]})`
          : 'Liens vers des URL de type landing détectés'
      return {
        score: 65,
        status: 'warning',
        details: {
          crawlLandingPages: crawlLandingPages.slice(0, 5),
          crawlOrphanConversionPages: crawlOrphanConversionPages.slice(0, 5),
          conversionLinks: conversionLinks.slice(0, 5),
          landingLinks: landingLinks.slice(0, 5),
          homepageIsLanding,
          hasUtmLinks,
        },
        recommendations: [
          'Des pages de conversion sont détectées mais restent peu nombreuses — multiplier les landing pages par offre, par segment ou par canal permet d\'augmenter le taux de conversion de 30 à 55% vs une page générique.',
          ctx.site.isEcommerce
            ? 'Pour un e-commerce, créez une landing page par campagne Google Shopping ou Meta Ads avec le produit phare, un témoignage et un bouton d\'achat unique — sans le menu de navigation.'
            : 'Une landing page efficace = 1 offre + 1 audience + 1 CTA. Supprimez la navigation pour réduire les distractions et doubler le taux de conversion.',
        ],
        summary: evidence,
      }
    }

    // Aucune landing détectée
    return {
      score: 15,
      status: 'critical',
      details: {
        detected: false,
        hasCrawlData: !!ctx.crawl,
        hasUtmLinks,
        homepageIsLanding,
      },
      recommendations: [
        ctx.site.isEcommerce
          ? 'Aucune landing page dédiée détectée — envoyer du trafic payant (Google Ads, Meta Ads) directement sur la homepage génère en moyenne 2× moins de conversions qu\'une landing page ciblée.'
          : 'Aucune landing page de conversion détectée — sans page dédiée, chaque euro investi en publicité est gaspillé à 60-70% faute de continuité entre l\'annonce et la page d\'atterrissage.',
        'Une landing page se crée en quelques heures avec des outils no-code (Unbounce, Instapage, ou une simple page WordPress) et peut multiplier le ROI publicitaire par 2 à 4.',
        !ctx.crawl
          ? 'Activez le crawl intégré pour une détection plus précise des pages de conversion sur l\'ensemble du site.'
          : 'Structure recommandée : titre accrocheur → 3 bénéfices clés → preuve sociale (logos clients, avis) → formulaire ou bouton CTA unique → sans menu de navigation.',
      ],
      summary: 'Aucune landing page de conversion détectée',
    }
  },
}
