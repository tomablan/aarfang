import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const PROVIDERS: Array<{ id: string; label: string; patterns: string[]; inlinePatterns?: string[] }> = [
  {
    id: 'ga4',
    label: 'Google Analytics 4',
    patterns: ['googletagmanager.com/gtag/js', 'google-analytics.com/g/collect'],
    inlinePatterns: ["gtag('config', 'G-", 'gtag("config", "G-'],
  },
  {
    id: 'gtm',
    label: 'Google Tag Manager',
    patterns: ['googletagmanager.com/gtm.js'],
    inlinePatterns: ['GTM-'],
  },
  {
    id: 'ua',
    label: 'Universal Analytics',
    patterns: ['google-analytics.com/analytics.js', 'google-analytics.com/ga.js'],
    inlinePatterns: ["gtag('config', 'UA-", "ga('create', 'UA-"],
  },
  {
    id: 'matomo',
    label: 'Matomo',
    patterns: ['matomo.js', 'piwik.js'],
    inlinePatterns: ['var _paq', 'window._paq', 'Matomo'],
  },
  {
    id: 'plausible',
    label: 'Plausible',
    patterns: ['plausible.io/js/plausible', 'plausible.io/js/script'],
  },
  {
    id: 'adobe',
    label: 'Adobe Analytics',
    patterns: ['omniture.com', '2o7.net', 'adobedtm.com', 'assets.adobedtm.com'],
  },
  {
    id: 'mixpanel',
    label: 'Mixpanel',
    patterns: ['cdn.mxpnl.com', 'cdn4.mxpnl.com'],
    inlinePatterns: ['mixpanel.init('],
  },
]

export const analyticsSetup: Signal = {
  id: 'analytics_setup',
  category: 'sea',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    const scriptSrcs: string[] = []
    const scriptContents: string[] = []
    $('script').each((_, el) => {
      const src = $(el).attr('src')
      if (src) scriptSrcs.push(src.toLowerCase())
      else scriptContents.push(($(el).html() ?? '').toLowerCase())
    })

    const detected: string[] = []

    for (const provider of PROVIDERS) {
      const srcMatch = provider.patterns.some((p) => scriptSrcs.some((s) => s.includes(p.toLowerCase())))
      const inlineMatch = provider.inlinePatterns?.some((p) =>
        scriptContents.some((c) => c.includes(p.toLowerCase()))
      ) ?? false
      if (srcMatch || inlineMatch) detected.push(provider.label)
    }

    // GTM détecté → analytics gérés via tag manager, signal satisfait
    if (detected.includes('Google Tag Manager')) {
      const others = detected.filter((d) => d !== 'Google Tag Manager')
      const summary = others.length > 0
        ? `Google Tag Manager (+ ${others.join(', ')})`
        : 'Google Tag Manager (analytics inclus)'
      return {
        score: 100,
        status: 'good',
        details: { detected, count: detected.length, gtmDetected: true },
        recommendations: [],
        summary,
      }
    }

    if (detected.length > 0) {
      return {
        score: 100,
        status: 'good',
        details: { detected, count: detected.length },
        recommendations: [],
        summary: detected.join(', '),
      }
    }

    return {
      score: 5,
      status: 'critical',
      details: { detected: [] },
      recommendations: [
        'Aucun outil d\'analytics détecté — impossible de mesurer le ROI de vos campagnes SEA sans tracking.',
        'Installez Google Analytics 4 (gratuit) ou Google Tag Manager pour centraliser tous vos tags de suivi.',
        'Sans analytics, vous pilotez vos campagnes payantes à l\'aveugle.',
      ],
      summary: 'Aucun analytics détecté',
    }
  },
}
