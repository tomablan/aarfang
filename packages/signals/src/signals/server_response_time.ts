import type { Signal, SignalResult, AuditContext } from '../types.js'

export const serverResponseTime: Signal = {
  id: 'server_response_time',
  category: 'technique',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const ms = ctx.page.responseTimeMs

    let score: number
    let status: SignalResult['status']
    const recommendations: string[] = []

    if (ms < 200) {
      score = 100; status = 'good'
    } else if (ms < 500) {
      score = 80; status = 'good'
    } else if (ms < 1000) {
      score = 60; status = 'warning'
      recommendations.push(`Temps de réponse élevé (${ms}ms). Optimiser le serveur ou activer un CDN. Cible : < 500ms.`)
    } else if (ms < 2000) {
      score = 30; status = 'critical'
      recommendations.push(`Temps de réponse très élevé (${ms}ms). Investiguer les performances serveur (cache, base de données, hébergement).`)
    } else {
      score = 0; status = 'critical'
      recommendations.push(`Temps de réponse critique (${ms}ms). Le site est trop lent — risque d'abandon utilisateur et pénalité SEO.`)
    }

    const summary = `TTFB : ${ms}ms${ms < 200 ? ' — excellent' : ms < 500 ? ' — bon' : ms < 1000 ? ' — lent' : ' — critique'}`
    return { score, status, details: { responseTimeMs: ms }, recommendations, summary }
  },
}
