import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

/**
 * Score composite de maturité SEA — évalue si le site est prêt pour des campagnes payantes.
 * Vérifie : analytics + tags ads + CTA + formulaire/téléphone + vitesse (proxy) + HTTPS.
 */
export const seaReadiness: Signal = {
  id: 'sea_readiness',
  category: 'sea',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // ── 1. HTTPS (trafic payant sur HTTP = perte d'argent + pénalité Chrome) ──
    const hasHttps = ctx.page.finalUrl.startsWith('https://')

    // ── 2. Vitesse serveur (proxy : temps de réponse < 1s) ──
    const fastResponse = ctx.page.responseTimeMs < 1000

    // ── 3. Analytics présent ──
    const scriptSrcs: string[] = []
    const scriptContents: string[] = []
    $('script').each((_, el) => {
      const src = $(el).attr('src')
      if (src) scriptSrcs.push(src.toLowerCase())
      else scriptContents.push(($(el).html() ?? '').toLowerCase())
    })

    const hasAnalytics =
      scriptSrcs.some((s) =>
        s.includes('googletagmanager.com/gtag') ||
        s.includes('googletagmanager.com/gtm') ||
        s.includes('google-analytics.com') ||
        s.includes('matomo.js') ||
        s.includes('piwik.js') ||
        s.includes('plausible.io')
      ) ||
      scriptContents.some((c) =>
        c.includes("gtag('config'") ||
        c.includes('var _paq') ||
        c.includes('gtm-')
      )

    // ── 4. Tag de conversion (Google Ads ou Meta) ──
    const hasConversionTag =
      scriptContents.some((c) => c.includes("'aw-") || c.includes('"aw-') || c.includes('google_conversion_id')) ||
      scriptSrcs.some((s) => s.includes('connect.facebook.net') && s.includes('fbevents')) ||
      scriptContents.some((c) => c.includes("fbq('init'") || c.includes('fbq("init"'))

    // ── 5. CTA clair (bouton ou lien d'action) ──
    const ctaKeywords = ['contact', 'devis', 'réserver', 'reserver', 'acheter', 'commander', 'commandez',
      'appeler', 'rappel', 'essai', 'inscription', 'inscrivez', 'demande', 'obtenir', 'télécharger',
      'consulter', 'découvrir', 'commencer', 'démarrer', 'buy', 'order', 'book', 'get started', 'sign up']
    const hasCtaButton = $('a[href], button').toArray().some((el) => {
      const text = ($(el).text() || $(el).attr('value') || '').toLowerCase()
      return ctaKeywords.some((kw) => text.includes(kw))
    })

    // ── 6. Formulaire de contact ou numéro de téléphone (conversion possible) ──
    const hasForm = $('form').length > 0
    const hasPhone = /(\+33|0[1-9])[\s.\-]?(\d{2}[\s.\-]?){4}|tel:/.test(html)
    const hasConversionPoint = hasForm || hasPhone

    // ── 7. Balise Title + H1 (Quality Score Google) ──
    const hasTitle = !!$('title').text().trim()
    const hasH1 = !!$('h1').first().text().trim()

    // ── Calcul du score ──
    const checks = [
      { key: 'https',           label: 'HTTPS',                     passed: hasHttps,          weight: 2 },
      { key: 'analytics',       label: 'Analytics',                  passed: hasAnalytics,      weight: 3 },
      { key: 'conversionTag',   label: 'Tag de conversion',          passed: hasConversionTag,  weight: 3 },
      { key: 'ctaButton',       label: 'CTA visible',                passed: hasCtaButton,      weight: 2 },
      { key: 'conversionPoint', label: 'Formulaire ou téléphone',   passed: hasConversionPoint, weight: 2 },
      { key: 'titleAndH1',      label: 'Title + H1 (Quality Score)', passed: hasTitle && hasH1, weight: 1 },
      { key: 'fastResponse',    label: 'Temps de réponse < 1s',     passed: fastResponse,       weight: 1 },
    ]

    const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
    const earnedWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0)
    const ratio = earnedWeight / totalWeight

    const passing = checks.filter((c) => c.passed).map((c) => c.label)
    const failing = checks.filter((c) => !c.passed).map((c) => c.label)

    const recommendations: string[] = []

    if (!hasAnalytics) {
      recommendations.push('Aucun analytics : sans mesure, impossible d\'optimiser les campagnes payantes. Installez GA4 ou GTM en priorité.')
    }
    if (!hasConversionTag) {
      recommendations.push('Aucun tag de conversion Google Ads ou Meta Pixel — vos campagnes ne peuvent pas mesurer leur ROI ni activer le Smart Bidding.')
    }
    if (!hasHttps) {
      recommendations.push('Le site n\'est pas en HTTPS — Google Ads peut désapprouver les annonces pointant vers des pages HTTP non sécurisées.')
    }
    if (!hasCtaButton) {
      recommendations.push('Pas de CTA visible — une landing page sans appel à l\'action clair fait baisser le Quality Score et pénalise le coût par clic.')
    }
    if (!hasConversionPoint) {
      recommendations.push('Ni formulaire ni numéro de téléphone détecté — l\'internaute qui arrive via une annonce n\'a aucun moyen de convertir immédiatement.')
    }
    if (!hasTitle || !hasH1) {
      recommendations.push('Title ou H1 manquant — ces éléments influencent directement le Quality Score Google Ads et donc votre CPC.')
    }
    if (!fastResponse) {
      recommendations.push(`Temps de réponse serveur lent (${ctx.page.responseTimeMs}ms) — Google pénalise les landing pages lentes dans le calcul du Quality Score.`)
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (ratio >= 0.85)      { score = 100; status = 'good'     }
    else if (ratio >= 0.70) { score = 80;  status = 'good'     }
    else if (ratio >= 0.55) { score = 60;  status = 'warning'  }
    else if (ratio >= 0.40) { score = 35;  status = 'critical' }
    else                    { score = 10;  status = 'critical' }

    return {
      score,
      status,
      details: {
        checks: Object.fromEntries(checks.map((c) => [c.key, c.passed])),
        passing,
        failing,
        score: Math.round(ratio * 100),
      },
      recommendations,
      summary: failing.length === 0
        ? 'Site prêt pour des campagnes SEA'
        : `${passing.length}/${checks.length} critères OK — manque : ${failing.slice(0, 3).join(', ')}${failing.length > 3 ? '…' : ''}`,
    }
  },
}
