import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const videoPresence: Signal = {
  id: 'video_presence',
  category: 'opportunites',
  weight: 1,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // ── 1. Balise <video> native ──
    const hasNativeVideo = $('video').length > 0

    // ── 2. Iframes YouTube / Vimeo ──
    let videoProvider: string | null = null
    $('iframe').each((_, el) => {
      const src = ($(el).attr('src') ?? '').toLowerCase()
      if (src.includes('youtube.com') || src.includes('youtu.be')) videoProvider = 'YouTube'
      else if (src.includes('vimeo.com')) videoProvider = 'Vimeo'
      else if (src.includes('wistia.com') || src.includes('wistia.net')) videoProvider = 'Wistia'
      else if (src.includes('loom.com')) videoProvider = 'Loom'
      else if (src.includes('dailymotion.com')) videoProvider = 'Dailymotion'
    })

    // ── 3. Liens YouTube / Vimeo dans le HTML ──
    const hasVideoLink =
      html.includes('youtube.com/watch') || html.includes('youtu.be/') ||
      html.includes('vimeo.com/') || html.includes('wistia.com/medias/')

    // ── 4. Schema.org VideoObject ──
    let hasVideoSchema = false
    $('script[type="application/ld+json"]').each((_, el) => {
      const content = ($(el).html() ?? '').toLowerCase()
      if (content.includes('"videoobject"')) hasVideoSchema = true
    })

    // ── 5. Wistia / Loom inline scripts ──
    const hasVideoScript =
      html.includes('fast.wistia.com') || html.includes('embed.loom.com') ||
      html.includes('player.vimeo.com')

    const detected = hasNativeVideo || videoProvider !== null || hasVideoLink || hasVideoSchema || hasVideoScript

    if (detected) {
      const source = videoProvider ?? (hasNativeVideo ? 'Vidéo native' : hasVideoSchema ? 'VideoObject JSON-LD' : 'Vidéo détectée')
      return {
        score: 100,
        status: 'good',
        details: { detected, source, hasNativeVideo, videoProvider, hasVideoSchema },
        recommendations: [],
        summary: `Vidéo détectée : ${source}`,
      }
    }

    return {
      score: 50,
      status: 'warning',
      details: { detected: false },
      recommendations: [
        'Aucune vidéo détectée — les pages avec vidéo retiennent les visiteurs 2× plus longtemps, ce qui améliore les signaux comportementaux envoyés à Google.',
        ctx.site.isEcommerce
          ? 'Pour un e-commerce, une vidéo produit de 30–60 secondes augmente le taux de conversion de 25 à 80% selon les études Nielsen et Shopify.'
          : 'Une vidéo de présentation "qui sommes-nous ?" ou un témoignage client renforce la confiance et réduit le taux de rebond en moins d\'une semaine.',
        'YouTube reste la plateforme gratuite la plus efficace — une chaîne YouTube alimente à la fois le site et le SEO vidéo sur Google.',
      ],
      summary: 'Aucune vidéo de présentation',
    }
  },
}
