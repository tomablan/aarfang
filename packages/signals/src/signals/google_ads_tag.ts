import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const googleAdsTag: Signal = {
  id: 'google_ads_tag',
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

    const html = ctx.page.html.toLowerCase()

    // Détection du tag Google Ads (AW-XXXXXXXXX)
    const hasAdsConversionScript =
      scriptSrcs.some((s) => s.includes('googletagmanager.com/gtag/js')) &&
      (scriptContents.some((c) => c.includes("'aw-") || c.includes('"aw-')) ||
        html.includes("'aw-") || html.includes('"aw-'))

    // Google Ads Remarketing tag classique
    const hasRemarketingTag =
      scriptSrcs.some((s) => s.includes('googleadservices.com/pagead/conversion')) ||
      scriptContents.some((c) => c.includes('google_conversion_id') || c.includes('google_trackconversion'))

    // Google Ads via noscript pixel
    const hasNoscriptPixel =
      $('noscript').toArray().some((el) => {
        const content = $(el).html() ?? ''
        return content.includes('googleadservices.com') || content.includes('googlesyndication.com')
      })

    // Google Ads Remarketing audience
    const hasAudienceTag =
      scriptContents.some((c) =>
        c.includes('google_remarketing_only') ||
        c.includes('googleads.g.doubleclick.net') ||
        c.includes('pagead2.googlesyndication.com')
      )

    // Google Tag (nouvelle génération, remplace gtag pour Ads)
    const hasGoogleTag =
      scriptSrcs.some((s) => s.includes('googletagmanager.com/gtag/js')) &&
      scriptContents.some((c) => c.includes("'aw-") || c.includes('"aw-'))

    const detected = {
      conversionTracking: hasAdsConversionScript || hasGoogleTag,
      remarketingTag: hasRemarketingTag || hasNoscriptPixel,
      audienceTag: hasAudienceTag,
    }

    const detectedList: string[] = []
    if (detected.conversionTracking) detectedList.push('Conversion tracking (AW-)')
    if (detected.remarketingTag) detectedList.push('Tag de remarketing')
    if (detected.audienceTag) detectedList.push('Audience remarketing')

    if (detectedList.length > 0) {
      return {
        score: 100,
        status: 'good',
        details: { detected, detectedList },
        recommendations: [],
        summary: detectedList.join(', '),
      }
    }

    return {
      score: 20,
      status: 'warning',
      details: { detected },
      recommendations: [
        'Aucun tag Google Ads détecté — sans conversion tracking, impossible d\'optimiser vos campagnes Google Ads (Smart Bidding inopérant).',
        'Ajoutez le tag Google Ads via Google Tag Manager et configurez au minimum un événement de conversion (formulaire soumis, appel téléphonique, achat).',
        'Le remarketing Google Ads permet de recibler les visiteurs qui n\'ont pas converti — très rentable sur des audiences chaudes.',
      ],
      summary: 'Aucun tag Google Ads détecté',
    }
  },
}
