import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const metaPixel: Signal = {
  id: 'meta_pixel',
  category: 'sea',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    const scriptSrcs: string[] = []
    const scriptContents: string[] = []
    $('script').each((_, el) => {
      const src = $(el).attr('src')
      if (src) scriptSrcs.push(src.toLowerCase())
      else scriptContents.push(($(el).html() ?? '').toLowerCase())
    })

    // Meta Pixel (Facebook)
    const hasMetaPixel =
      scriptSrcs.some((s) => s.includes('connect.facebook.net') && s.includes('fbevents')) ||
      scriptContents.some((c) =>
        c.includes("fbq('init'") ||
        c.includes('fbq("init"') ||
        c.includes('window.fbq') ||
        c.includes('facebook-pixel')
      )

    // noscript pixel Meta
    const hasNoscriptPixel =
      $('noscript img, img[src*="facebook.com/tr"]').length > 0 ||
      $('noscript').toArray().some((el) => ($(el).html() ?? '').includes('facebook.com/tr'))

    // Conversion API (CAPI) — signal côté serveur, difficile à détecter côté HTML
    // On peut détecter des data-attributes ou meta tags liés à CAPI
    const hasCapiHint =
      $('[data-pixel-id]').length > 0 ||
      $('meta[name="facebook-domain-verification"]').length > 0

    // LinkedIn Insight Tag (bonus)
    const hasLinkedIn =
      scriptSrcs.some((s) => s.includes('snap.licdn.com') || s.includes('linkedin.com/analytics')) ||
      scriptContents.some((c) => c.includes('_linkedin_partner_id') || c.includes('window._linkedin_data_partner_ids'))

    // TikTok Pixel
    const hasTikTok =
      scriptSrcs.some((s) => s.includes('analytics.tiktok.com')) ||
      scriptContents.some((c) => c.includes('ttq.load(') || c.includes('tiktok pixel'))

    const detected: Record<string, boolean> = {
      metaPixel: hasMetaPixel || hasNoscriptPixel,
      capiHint: hasCapiHint,
      linkedIn: hasLinkedIn,
      tikTok: hasTikTok,
    }

    const detectedList: string[] = []
    if (detected.metaPixel) detectedList.push('Meta Pixel')
    if (detected.capiHint) detectedList.push('Conversion API')
    if (detected.linkedIn) detectedList.push('LinkedIn Insight Tag')
    if (detected.tikTok) detectedList.push('TikTok Pixel')

    if (detectedList.length > 0) {
      const recommendations: string[] = []
      if (detected.metaPixel && !detected.capiHint) {
        recommendations.push('Meta recommande de combiner le Pixel avec la Conversion API (CAPI) pour maintenir la précision du tracking malgré les bloqueurs de publicité et iOS 14+.')
      }
      return {
        score: 100,
        status: 'good',
        details: { detected, detectedList },
        recommendations,
        summary: detectedList.join(', '),
      }
    }

    return {
      score: 20,
      status: 'warning',
      details: { detected },
      recommendations: [
        'Aucun pixel Meta (Facebook/Instagram Ads) détecté — sans lui, impossible de créer des audiences personnalisées ni de mesurer les conversions issues de vos campagnes Meta.',
        'Installez le Meta Pixel via votre Business Manager pour activer le reciblage des visiteurs et les audiences similaires (Lookalike).',
        'Meta Ads (Facebook + Instagram) représente souvent 30 à 50% du budget paid pour les marques B2C.',
      ],
      summary: 'Aucun pixel social ads détecté',
    }
  },
}
