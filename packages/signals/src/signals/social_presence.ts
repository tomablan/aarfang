import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

const PLATFORMS: Array<{ id: string; label: string; patterns: string[] }> = [
  { id: 'facebook',  label: 'Facebook',  patterns: ['facebook.com/', 'fb.com/'] },
  { id: 'instagram', label: 'Instagram', patterns: ['instagram.com/'] },
  { id: 'linkedin',  label: 'LinkedIn',  patterns: ['linkedin.com/company/', 'linkedin.com/in/'] },
  { id: 'youtube',   label: 'YouTube',   patterns: ['youtube.com/channel/', 'youtube.com/c/', 'youtube.com/@'] },
  { id: 'twitter',   label: 'X / Twitter', patterns: ['twitter.com/', 'x.com/'] },
  { id: 'tiktok',    label: 'TikTok',    patterns: ['tiktok.com/@'] },
  { id: 'pinterest', label: 'Pinterest', patterns: ['pinterest.com/', 'pinterest.fr/'] },
  { id: 'snapchat',  label: 'Snapchat',  patterns: ['snapchat.com/add/'] },
]

export const socialPresence: Signal = {
  id: 'social_presence',
  category: 'opportunites',
  weight: 1,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const found: Array<{ id: string; label: string; href: string }> = []

    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').toLowerCase()
      for (const platform of PLATFORMS) {
        if (found.some((f) => f.id === platform.id)) continue
        if (platform.patterns.some((p) => href.includes(p))) {
          found.push({ id: platform.id, label: platform.label, href: $(el).attr('href') ?? '' })
        }
      }
    })

    const count = found.length
    const labels = found.map((f) => f.label)
    const missing = PLATFORMS.filter((p) => !found.some((f) => f.id === p.id)).map((p) => p.label)
    const recommendations: string[] = []

    if (count === 0) {
      recommendations.push('Aucun lien vers les réseaux sociaux détecté — les ajouter en pied de page renforce la crédibilité et facilite le suivi de la marque.')
    } else {
      const coreIds = ['facebook', 'instagram', 'linkedin']
      const missingCore = coreIds.filter((id) => !found.some((f) => f.id === id))
      if (missingCore.length > 0) {
        recommendations.push(`Réseaux importants non liés : ${missingCore.map((id) => PLATFORMS.find((p) => p.id === id)!.label).join(', ')}.`)
      }
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'
    if (count >= 3) { score = 100; status = 'good' }
    else if (count === 2) { score = 75; status = 'good' }
    else if (count === 1) { score = 45; status = 'warning' }
    else { score = 10; status = 'critical' }

    return {
      score,
      status,
      details: { found, missing },
      recommendations,
      summary: count === 0
        ? 'Aucun réseau social lié'
        : `${count} réseau(x) : ${labels.join(', ')}`,
    }
  },
}
