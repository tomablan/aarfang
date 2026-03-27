import type { Signal, SignalResult, AuditContext } from '../types.js'

export const httpsEnabled: Signal = {
  id: 'https_enabled',
  category: 'securite',
  weight: 4,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const isHttps = ctx.page.finalUrl.startsWith('https://')
    if (isHttps) {
      return { score: 100, status: 'good', details: { protocol: 'https' }, recommendations: [], summary: 'HTTPS activé' }
    }
    return {
      score: 0,
      status: 'critical',
      details: { protocol: 'http', finalUrl: ctx.page.finalUrl },
      recommendations: ['Migrer le site vers HTTPS pour sécuriser les communications et améliorer le SEO.'],
      summary: `Le site répond en HTTP — aucun chiffrement (${ctx.page.finalUrl})`,
    }
  },
}
