import type { Signal, SignalResult, AuditContext } from '../types.js'

export const ecoCompression: Signal = {
  id: 'eco_compression',
  category: 'ecoconception',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const encoding = (ctx.page.headers['content-encoding'] ?? '').toLowerCase()

    if (encoding.includes('br')) {
      return {
        score: 100,
        status: 'good',
        details: { encoding: 'brotli' },
        recommendations: [],
        summary: 'Compression Brotli activée — transfert optimisé',
      }
    }
    if (encoding.includes('gzip') || encoding.includes('deflate')) {
      return {
        score: 80,
        status: 'good',
        details: { encoding },
        recommendations: [
          'Compression GZip active. Activer Brotli (br) pour réduire le transfert de ~15–25 % supplémentaires.',
        ],
        summary: `Compression ${encoding} active — Brotli serait encore mieux`,
      }
    }
    return {
      score: 0,
      status: 'critical',
      details: { encoding: 'none' },
      recommendations: [
        'Aucune compression HTTP détectée. Activer GZip ou Brotli sur le serveur pour réduire le poids transféré de 60–80 %.',
      ],
      summary: 'Pas de compression HTTP — transfert inutilement lourd',
    }
  },
}
