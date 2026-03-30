import type { Signal, SignalResult, AuditContext } from '../types.js'

export const httpsEnabled: Signal = {
  id: 'https_enabled',
  category: 'securite',
  weight: 4,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    // Site inaccessible (SSL down, timeout, serveur hors ligne)
    if (ctx.page.fetchError) {
      const labels: Record<string, string> = {
        ssl_expired: 'Certificat SSL expiré — site inaccessible',
        ssl_invalid: 'Erreur SSL — certificat invalide ou mal configuré',
        timeout: 'Site inaccessible — délai de connexion dépassé',
        unreachable: 'Site inaccessible — serveur hors ligne ou DNS introuvable',
        network: 'Site inaccessible — erreur réseau',
      }
      const label = labels[ctx.page.fetchErrorType ?? 'network'] ?? 'Site inaccessible'
      return {
        score: 0, status: 'critical',
        details: { fetchError: ctx.page.fetchError, fetchErrorType: ctx.page.fetchErrorType },
        recommendations: ['Vérifier que le serveur est en ligne et que le certificat SSL est valide.'],
        summary: label,
      }
    }
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
