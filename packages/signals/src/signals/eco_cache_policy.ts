import type { Signal, SignalResult, AuditContext } from '../types.js'

export const ecoCachePolicy: Signal = {
  id: 'eco_cache_policy',
  category: 'ecoconception',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const cacheControl = (ctx.page.headers['cache-control'] ?? '').toLowerCase()
    const etag = ctx.page.headers['etag']
    const lastModified = ctx.page.headers['last-modified']

    if (!cacheControl && !etag && !lastModified) {
      return {
        score: 0,
        status: 'critical',
        details: { cacheControl: null, etag: null, lastModified: null },
        recommendations: [
          'Aucune politique de cache définie. Configurer Cache-Control et ETag pour éviter les téléchargements répétés des mêmes ressources.',
        ],
        summary: 'Aucun cache HTTP configuré — chaque visite retélécharge tout',
      }
    }

    if (cacheControl.includes('no-store')) {
      return {
        score: 30,
        status: 'warning',
        details: { cacheControl },
        recommendations: [
          'Cache-Control: no-store interdit tout cache. Utiliser no-cache (avec ETag) pour les contenus dynamiques, ou définir un max-age pour les ressources statiques.',
        ],
        summary: `Cache désactivé (no-store) — ressources retéléchargées à chaque visite`,
      }
    }

    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/)
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : null

    if (maxAge !== null && maxAge >= 86400) {
      return {
        score: 100,
        status: 'good',
        details: { cacheControl, maxAgeSecs: maxAge },
        recommendations: [],
        summary: `Cache ${maxAge >= 2592000 ? '30 j' : Math.round(maxAge / 3600) + ' h'} configuré`,
      }
    }

    if (maxAge !== null && maxAge >= 3600) {
      return {
        score: 70,
        status: 'warning',
        details: { cacheControl, maxAgeSecs: maxAge },
        recommendations: [
          `Cache de ${Math.round(maxAge / 3600)} h configuré. Augmenter à 24 h minimum pour les ressources peu fréquemment modifiées.`,
        ],
        summary: `Cache court : ${Math.round(maxAge / 3600)} h (recommandé ≥ 24 h)`,
      }
    }

    // ETag ou Last-Modified présent sans max-age = revalidation systématique
    if (etag || lastModified) {
      return {
        score: 60,
        status: 'warning',
        details: { cacheControl: cacheControl || null, etag: !!etag, lastModified: !!lastModified },
        recommendations: [
          'ETag / Last-Modified présents mais sans max-age. Ajouter Cache-Control: max-age=86400 pour éviter les requêtes de revalidation inutiles.',
        ],
        summary: 'Revalidation active (ETag/Last-Modified) sans durée de cache',
      }
    }

    return {
      score: 40,
      status: 'warning',
      details: { cacheControl },
      recommendations: [
        'Politique de cache insuffisante. Définir Cache-Control avec max-age ≥ 86400 pour les pages statiques.',
      ],
      summary: 'Cache faiblement configuré',
    }
  },
}
