import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const EMAIL_PROVIDERS: Array<{ id: string; label: string; patterns: string[]; inlinePatterns?: string[] }> = [
  { id: 'mailchimp',   label: 'Mailchimp',    patterns: ['chimpstatic.com', 'list-manage.com', 'mailchimp.com/subscribe'] },
  { id: 'brevo',       label: 'Brevo',        patterns: ['sibforms.com', 'sendinblue.com', 'brevo.com'] },
  { id: 'klaviyo',     label: 'Klaviyo',      patterns: ['klaviyo.com', 'static.klaviyo.com'] },
  { id: 'hubspot',     label: 'HubSpot',      patterns: ['hs-scripts.com', 'hsforms.com', 'hubspot.com/forms'] },
  { id: 'convertkit',  label: 'ConvertKit',   patterns: ['convertkit.com', 'ck.page'] },
  { id: 'mailerlite',  label: 'MailerLite',   patterns: ['mailerlite.com', 'ml-attr.com'] },
  { id: 'activecampaign', label: 'ActiveCampaign', patterns: ['activehosted.com', 'activecampaign.com'] },
  { id: 'getresponse', label: 'GetResponse',  patterns: ['getresponse.com'] },
  { id: 'omnisend',    label: 'Omnisend',     patterns: ['omnisend.com', 'omnisnippet1.com'] },
  { id: 'privy',       label: 'Privy',        patterns: ['privy.com'] },
]

export const leadCapture: Signal = {
  id: 'lead_capture',
  category: 'opportunites',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    const scriptSrcs: string[] = []
    const scriptContents: string[] = []
    $('script').each((_, el) => {
      const src = $(el).attr('src')
      if (src) scriptSrcs.push(src.toLowerCase())
      else scriptContents.push(($(el).html() ?? '').toLowerCase())
    })

    // ── 1. Détection de plateforme emailing connue ──
    let detectedProvider: string | null = null
    for (const p of EMAIL_PROVIDERS) {
      const match =
        p.patterns.some((pat) => scriptSrcs.some((s) => s.includes(pat)) || html.includes(pat)) ||
        (p.inlinePatterns ?? []).some((pat) => scriptContents.some((c) => c.includes(pat)))
      if (match) { detectedProvider = p.label; break }
    }

    // ── 2. Formulaire newsletter générique ──
    const newsletterKeywords = [
      'newsletter', 'abonnez-vous', 'abonnement', 'inscription', 'subscribe',
      'restez informé', 'recevez nos', 'nos actualités', 'email', 'e-mail',
    ]
    let hasNewsletterForm = false
    $('form').each((_, form) => {
      const formText = $(form).text().toLowerCase()
      const formHtml = ($(form).html() ?? '').toLowerCase()
      if (newsletterKeywords.some((kw) => formText.includes(kw) || formHtml.includes(kw))) {
        hasNewsletterForm = true
      }
    })

    // ── 3. Champ email isolé (lead magnet, popup) ──
    const hasEmailInput = $('input[type="email"]').length > 0
    const emailInputContext = $('input[type="email"]').closest('form').text().toLowerCase()
    const isContactOnly = ['contact', 'message', 'envoyer', 'devis'].some((kw) => emailInputContext.includes(kw))
    const hasLeadEmailInput = hasEmailInput && !isContactOnly

    // ── 4. Popup / modale de capture ──
    const hasPopupHint =
      html.includes('popup') || html.includes('modal') || html.includes('optin') ||
      html.includes('opt-in') || html.includes('leadbox') || html.includes('lightbox')

    const detected = detectedProvider ?? (hasNewsletterForm || hasLeadEmailInput ? 'Formulaire générique' : null)

    if (detected) {
      return {
        score: 100,
        status: 'good',
        details: { detected, provider: detectedProvider, hasNewsletterForm, hasLeadEmailInput, hasPopupHint },
        recommendations: [],
        summary: `Capture email : ${detected}`,
      }
    }

    return {
      score: 15,
      status: 'critical',
      details: { detected: false, hasEmailInput, hasPopupHint },
      recommendations: [
        '100% des visiteurs repartent sans laisser de contact — un formulaire de capture email permettrait de récupérer 3 à 8% du trafic comme prospects qualifiés.',
        'Solutions gratuites à fort impact : Brevo (ex-Sendinblue), Mailchimp, MailerLite. Déploiement en 1 heure.',
        ctx.site.isEcommerce
          ? 'Pour un e-commerce, une séquence de bienvenue email génère en moyenne 320% de revenus supplémentaires vs un email promotionnel standard.'
          : 'Une newsletter mensuelle maintient le lien avec les prospects qui ne sont pas encore prêts à acheter — essentiel pour les cycles de vente longs.',
      ],
      summary: 'Aucune capture email / newsletter',
    }
  },
}
