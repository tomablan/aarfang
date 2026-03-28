import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Scripts/attributs des principaux CMP du marché français
const CMP_SCRIPT_PATTERNS = [
  'axeptio',
  'tarteaucitron',
  'onetrust',
  'cookiebot',
  'didomi',
  'cookiefirst',
  'cookiehub',
  'cookie-consent',
  'cookie_consent',
  'cookieinformation',
  'quantcast',
  'usercentrics',
  'iubenda',
  'consentmanager',
  'klaro',
  'cookieyes',
  'termly',
  'osano',
  'civic-cookie',
]

const CMP_INLINE_EXTRA_PATTERNS = [
  'window.axeptio',
  'window.CookieConsent',
  'window.cookieconsent',
  'window.Cookiebot',
  'window.Didomi',
  'window.OneTrust',
  'window.__cmp',
  'window.__tcfapi',
  '__tcfapi',
  'CookieConsentApi',
  '_axcb',
  'cookieLaw',
]

const CMP_ELEMENT_PATTERNS = [
  // IDs / classes courants
  '#axeptio_overlay', '#axeptio_btn', '.axeptio',
  '#onetrust-banner-sdk', '#onetrust-accept-btn-handler', '.onetrust',
  '.tarteaucitronAlertBig', '#tarteaucitronAlertBig', '#tarteaucitronRoot',
  '#didomi-host', '.didomi',
  '#cookiebanner', '.cookiebanner', '.cookie-banner',
  '#CybotCookiebotDialog', '.cookiebot',
  '#cookie-notice', '#cookie-banner', '#cookie-consent', '.cookie-consent',
  '#gdpr-banner', '#gdpr-cookie', '.gdpr-banner',
  '.cc-banner', '.cc-window', '.cc-revoke',
  '.cookie-law-info-bar', '#cookie-law-info-bar',
  '.wt-cli-cookie-bar', '#wt-cli-cookie-bar',
  '.moove-gdpr-infobar', '#moove-gdpr-infobar',
  '.cookie-popup', '.consent-banner', '.consent-popup',
  '.cookie-notice', '.cookie-overlay', '.cookie-modal',
  '[id*="cookie"][id*="consent"]', '[id*="gdpr"]',
  '[class*="cookie-consent"]', '[class*="cookieconsent"]',
  '[data-cookieconsent]', '[data-gdpr]', '[data-cookie-consent]',
]

// Mots-clés visibles dans le texte de la page (bannières render-side)
const COOKIE_TEXT_KEYWORDS = [
  'accepter les cookies',
  'accepter tous les cookies',
  'refuser les cookies',
  'tout accepter',
  'tout refuser',
  'je refuse',
  'gérer mes préférences',
  'paramètres des cookies',
  'consentement aux cookies',
  'ce site utilise des cookies',
  'nous utilisons des cookies',
  'accept all cookies',
  'reject all',
  'manage preferences',
  'cookie settings',
  'cookie policy',
  'politique de cookies',
  'gestion des cookies',
]

export const cookieConsent: Signal = {
  id: 'cookie_consent',
  category: 'conformite',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // 1. Vérifier les scripts chargés (src ou contenu inline)
    let detectedCmp: string | null = null
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src')?.toLowerCase() ?? ''
      const match = CMP_SCRIPT_PATTERNS.find((p) => src.includes(p))
      if (match && !detectedCmp) detectedCmp = match
    })

    // Scripts inline (souvent pour Axeptio, Didomi…)
    if (!detectedCmp) {
      $('script:not([src])').each((_, el) => {
        const content = $(el).html()?.toLowerCase() ?? ''
        const match = CMP_SCRIPT_PATTERNS.find((p) => content.includes(p))
        if (match && !detectedCmp) detectedCmp = match
        if (!detectedCmp) {
          const extra = CMP_INLINE_EXTRA_PATTERNS.find((p) => content.includes(p.toLowerCase()))
          if (extra) detectedCmp = extra
        }
      })
    }

    if (detectedCmp != null) {
      const cmp: string = detectedCmp
      const label = cmp.charAt(0).toUpperCase() + cmp.slice(1)
      return {
        score: 100,
        status: 'good',
        details: { detected: true, cmp },
        recommendations: [],
        summary: `CMP détecté : ${label}`,
      }
    }

    // 2. Chercher des éléments HTML de bannière
    let foundElement: string | null = null
    for (const selector of CMP_ELEMENT_PATTERNS) {
      try {
        if ($(selector).length > 0) { foundElement = selector; break }
      } catch {}
    }

    if (foundElement) {
      return {
        score: 70,
        status: 'warning',
        details: { detected: true, cmp: 'inconnu', element: foundElement },
        recommendations: ['Bannière cookies détectée mais solution non identifiée — vérifier la conformité RGPD (consentement explicite, refus aussi simple qu\'acceptation).'],
        summary: 'Bannière cookies présente (solution non identifiée)',
      }
    }

    // 3. Recherche textuelle large dans le HTML (texte visible + attributs)
    const cookieKeywords = [
      'axeptio', 'tarteaucitron', 'cookiebot', 'didomi',
      ...COOKIE_TEXT_KEYWORDS.map((k) => k.toLowerCase()),
    ]
    const foundKeyword = cookieKeywords.find((k) => html.includes(k))

    if (foundKeyword) {
      return {
        score: 50,
        status: 'warning',
        details: { detected: true, cmp: 'inconnu', keyword: foundKeyword },
        recommendations: ['Mention de cookies détectée mais aucune bannière de consentement formelle identifiée — vérifier la conformité avec les recommandations CNIL.'],
        summary: 'Mention cookies présente (bannière non confirmée)',
      }
    }

    return {
      score: 0,
      status: 'critical',
      details: { detected: false },
      recommendations: [
        'Aucune bannière de gestion des cookies détectée — le site est potentiellement en infraction avec le RGPD et les recommandations de la CNIL.',
        'Mettre en place une solution de gestion du consentement (Axeptio, Tarteaucitron, Cookiebot, Didomi…).',
      ],
      summary: 'Aucune bannière cookies détectée',
    }
  },
}
