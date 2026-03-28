import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const contentFreshness: Signal = {
  id: 'content_freshness',
  category: 'seo_technique',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()
    const currentYear = new Date().getFullYear()

    // ── 1. og:updated_time ou article:modified_time ──
    const ogUpdated =
      $('meta[property="og:updated_time"]').attr('content') ??
      $('meta[property="article:modified_time"]').attr('content') ??
      null

    // ── 2. Balises <time> avec dateTime ──
    let latestDate: Date | null = null
    $('time[datetime]').each((_, el) => {
      const dt = $(el).attr('datetime') ?? ''
      const d = new Date(dt)
      if (!isNaN(d.getTime())) {
        if (!latestDate || d > latestDate) latestDate = d
      }
    })

    // ── 3. JSON-LD dateModified / datePublished ──
    let jsonLdDate: string | null = null
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}')
        const d = data.dateModified ?? data.datePublished ?? null
        if (d && typeof d === 'string') jsonLdDate = d
      } catch {}
    })

    // ── 4. Copyright year dans le footer ──
    const copyrightMatch = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/)
    const copyrightYear = copyrightMatch
      ? parseInt(copyrightMatch[1] ?? copyrightMatch[2] ?? '0', 10)
      : null

    // ── Déterminer l'année la plus récente trouvée ──
    const candidates: number[] = []
    if (ogUpdated) { const d = new Date(ogUpdated); if (!isNaN(d.getTime())) candidates.push(d.getFullYear()) }
    if (latestDate) candidates.push((latestDate as Date).getFullYear())
    if (jsonLdDate) { const d = new Date(jsonLdDate); if (!isNaN(d.getTime())) candidates.push(d.getFullYear()) }
    if (copyrightYear) candidates.push(copyrightYear)

    const mostRecentYear = candidates.length > 0 ? Math.max(...candidates) : null
    const yearGap = mostRecentYear ? currentYear - mostRecentYear : null

    // ── Calcul du score ──
    if (mostRecentYear === null) {
      return {
        score: 40,
        status: 'warning',
        details: { mostRecentYear: null, copyrightYear },
        recommendations: [
          'Aucune date de mise à jour détectable — Google valorise le contenu récent, surtout sur les requêtes sensibles au temps.',
          'Ajoutez la balise <meta property="article:modified_time"> ou un JSON-LD dateModified pour indiquer aux moteurs la fraîcheur de vos pages.',
        ],
        summary: 'Fraîcheur du contenu indéterminée',
      }
    }

    if (yearGap !== null && yearGap >= 2) {
      return {
        score: 25,
        status: 'critical',
        details: { mostRecentYear, yearGap, copyrightYear },
        recommendations: [
          `Dernière mise à jour détectée en ${mostRecentYear} (il y a ${yearGap} ans) — les moteurs de recherche pénalisent les sites dont le contenu semble obsolète.`,
          'Mettez à jour vos articles phares (statistiques, exemples, liens) et incrémentez la date de modification : l\'impact SEO est souvent visible en 4-6 semaines.',
          'Un audit annuel de votre contenu permet de republier les pages stratégiques avec une date récente et de récupérer les positions perdues.',
        ],
        summary: `Contenu potentiellement obsolète (${mostRecentYear})`,
      }
    }

    if (yearGap === 1) {
      return {
        score: 70,
        status: 'warning',
        details: { mostRecentYear, yearGap, copyrightYear },
        recommendations: [
          `Contenu datant de ${mostRecentYear} — envisagez une mise à jour annuelle de vos pages clés pour maintenir la fraîcheur SEO.`,
        ],
        summary: `Contenu mis à jour en ${mostRecentYear}`,
      }
    }

    return {
      score: 100,
      status: 'good',
      details: { mostRecentYear, yearGap: 0, copyrightYear },
      recommendations: [],
      summary: `Contenu récent détecté (${mostRecentYear})`,
    }
  },
}
