import type { Signal, SignalResult, AuditContext } from '../types.js'

export const ecoPageWeight: Signal = {
  id: 'eco_page_weight',
  category: 'ecoconception',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const bytes = Buffer.byteLength(ctx.page.html, 'utf8')
    const kb = Math.round(bytes / 1024)

    if (kb < 100) {
      return {
        score: 100,
        status: 'good',
        details: { sizeKb: kb },
        recommendations: [],
        summary: `HTML léger : ${kb} Ko`,
      }
    }
    if (kb < 300) {
      return {
        score: 60,
        status: 'warning',
        details: { sizeKb: kb },
        recommendations: [
          `La page HTML pèse ${kb} Ko. Réduire le code inline (JavaScript, CSS, SVG) pour descendre sous 100 Ko.`,
        ],
        summary: `HTML volumineux : ${kb} Ko (optimal < 100 Ko)`,
      }
    }
    return {
      score: 20,
      status: 'critical',
      details: { sizeKb: kb },
      recommendations: [
        `La page HTML pèse ${kb} Ko — impact fort sur l'empreinte carbone. Externaliser les scripts et styles, supprimer le code mort, minifier le HTML.`,
      ],
      summary: `HTML très lourd : ${kb} Ko (optimal < 100 Ko)`,
    }
  },
}
