import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const CHAT_PROVIDERS: Array<{ id: string; label: string; patterns: string[] }> = [
  { id: 'intercom',    label: 'Intercom',       patterns: ['intercom.io', 'widget.intercom.io', 'js.intercomcdn.com'] },
  { id: 'crisp',       label: 'Crisp',           patterns: ['crisp.chat', 'client.crisp.chat'] },
  { id: 'tawk',        label: 'Tawk.to',         patterns: ['tawk.to', 'embed.tawk.to'] },
  { id: 'tidio',       label: 'Tidio',           patterns: ['tidio.com', 'code.tidio.co'] },
  { id: 'freshchat',   label: 'Freshchat',       patterns: ['freshchat.com', 'wchat.freshchat.com'] },
  { id: 'zendesk',     label: 'Zendesk Chat',    patterns: ['zopim.com', 'zendesk.com/embeddable', 'static.zdassets.com'] },
  { id: 'hubspot',     label: 'HubSpot Chat',    patterns: ['hs-scripts.com', 'hubspot.com/conversations'] },
  { id: 'drift',       label: 'Drift',           patterns: ['drift.com', 'js.driftt.com'] },
  { id: 'livechat',    label: 'LiveChat',        patterns: ['livechatinc.com', 'cdn.livechatinc.com'] },
  { id: 'olark',       label: 'Olark',           patterns: ['olark.com'] },
  { id: 'smartsupp',   label: 'Smartsupp',       patterns: ['smartsupp.com'] },
  { id: 'userlike',    label: 'Userlike',        patterns: ['userlike.com'] },
  { id: 'chatwoot',    label: 'Chatwoot',        patterns: ['chatwoot.com'] },
  { id: 'facebook_msg',label: 'Messenger',       patterns: ['connect.facebook.net', 'facebook.com/customer_chat'] },
  { id: 'whatsapp',    label: 'WhatsApp',        patterns: ['wa.me/', 'api.whatsapp.com/send', 'web.whatsapp.com'] },
]

export const liveChat: Signal = {
  id: 'live_chat',
  category: 'opportunites',
  weight: 1,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // Recherche dans les scripts (src + contenu inline)
    const scriptSrcs: string[] = []
    const scriptContents: string[] = []
    $('script').each((_, el) => {
      const src = $(el).attr('src')
      if (src) scriptSrcs.push(src.toLowerCase())
      else scriptContents.push(($(el).html() ?? '').toLowerCase())
    })

    let detected: { id: string; label: string } | null = null

    for (const provider of CHAT_PROVIDERS) {
      const match = provider.patterns.some((p) =>
        scriptSrcs.some((src) => src.includes(p)) ||
        scriptContents.some((content) => content.includes(p))
      )
      if (match) { detected = { id: provider.id, label: provider.label }; break }
    }

    // Fallback : recherche textuelle générique dans le HTML
    if (!detected) {
      const html = ctx.page.html.toLowerCase()
      const genericPatterns = ['livechat', 'live-chat', 'live_chat', 'chat-widget', 'chatbox', 'chat-bubble']
      if (genericPatterns.some((p) => html.includes(p))) {
        detected = { id: 'unknown', label: 'Chat (solution non identifiée)' }
      }
    }

    if (detected) {
      return {
        score: 100,
        status: 'good',
        details: { detected: true, provider: detected.id, label: detected.label },
        recommendations: [],
        summary: `Chat en ligne : ${detected.label}`,
      }
    }

    return {
      score: 20,
      status: 'warning',
      details: { detected: false },
      recommendations: [
        'Aucun widget de chat en ligne détecté — les sites avec chat convertissent en moyenne 3× mieux que ceux sans.',
        'Solutions gratuites ou freemium : Crisp, Tawk.to, HubSpot Chat.',
      ],
      summary: 'Pas de chat en ligne',
    }
  },
}
