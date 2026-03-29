import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const ecoThirdPartyScripts: Signal = {
  id: 'eco_third_party_scripts',
  category: 'ecoconception',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    let siteHost = ''
    try { siteHost = new URL(ctx.page.finalUrl).hostname.replace(/^www\./, '') } catch { /* ignore */ }

    const externalDomains = new Set<string>()
    const allExternalScripts: string[] = []

    $('script[src]').each((_, el) => {
      const src = $(el).attr('src') ?? ''
      if (!src.startsWith('http')) return // relative ou data:
      try {
        const host = new URL(src).hostname.replace(/^www\./, '')
        if (host && host !== siteHost) {
          externalDomains.add(host)
          allExternalScripts.push(host)
        }
      } catch { /* ignore */ }
    })

    // Compter aussi les iframes tierces (analytics, vidéos, maps...)
    $('iframe[src]').each((_, el) => {
      const src = $(el).attr('src') ?? ''
      if (!src.startsWith('http')) return
      try {
        const host = new URL(src).hostname.replace(/^www\./, '')
        if (host && host !== siteHost) externalDomains.add(host)
      } catch { /* ignore */ }
    })

    const count = externalDomains.size
    const domains = Array.from(externalDomains)

    // Identifier les domaines communs (tracking, pub...)
    const trackingDomains = domains.filter(d =>
      /google(tag|analytics|syndication)|facebook|doubleclick|hotjar|hubspot|intercom|drift|segment|mixpanel|amplitude|clarity\.ms|tiktok|linkedin/.test(d)
    )

    if (count === 0) {
      return {
        score: 100,
        status: 'good',
        details: { externalDomains: count, domains: [] },
        recommendations: [],
        summary: 'Aucun script tiers — empreinte réseau minimale',
      }
    }
    if (count <= 2) {
      return {
        score: 80,
        status: 'good',
        details: { externalDomains: count, domains },
        recommendations: count > 0 && trackingDomains.length > 0
          ? [`${trackingDomains.join(', ')} collecte des données. Vérifier que c'est nécessaire et conforme RGPD.`]
          : [],
        summary: `${count} domaine${count > 1 ? 's' : ''} tiers : ${domains.join(', ')}`,
      }
    }
    if (count <= 5) {
      return {
        score: 50,
        status: 'warning',
        details: { externalDomains: count, domains, trackingDomains },
        recommendations: [
          `${count} domaines tiers chargés (${domains.slice(0, 4).join(', ')}…). Chaque domaine tiers ajoute une connexion réseau et potentiellement un tracker. Limiter au strict nécessaire.`,
        ],
        summary: `${count} domaines tiers — impact performance et vie privée`,
      }
    }
    return {
      score: 15,
      status: 'critical',
      details: { externalDomains: count, domains, trackingDomains },
      recommendations: [
        `${count} domaines tiers détectés : ${domains.slice(0, 6).join(', ')}${count > 6 ? '…' : ''}. Supprimer les scripts non essentiels, auto-héberger les polices et bibliothèques JS si possible.`,
        ...(trackingDomains.length > 0 ? [`Trackers identifiés : ${trackingDomains.join(', ')}. Auditer leur nécessité réelle.`] : []),
      ],
      summary: `${count} domaines tiers — charge réseau et empreinte élevées`,
    }
  },
}
