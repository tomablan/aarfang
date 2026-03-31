import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

interface LighthouseImageAudit {
  score: number | null
  displayValue?: string
  items: Array<{ url: string; totalBytes?: number; wastedBytes?: number; wastedPercent?: number }>
}

async function fetchImageAudits(url: string, apiKey: string): Promise<{
  optimized: LighthouseImageAudit
  nextGen: LighthouseImageAudit
  responsive: LighthouseImageAudit
  offscreen: LighthouseImageAudit
}> {
  const params = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', key: apiKey })
  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,
    { signal: AbortSignal.timeout(30_000) }
  )
  if (!res.ok) throw new Error(`PageSpeed API error: ${res.status}`)
  const data = await res.json() as any
  const audits = data.lighthouseResult?.audits ?? {}

  const extract = (key: string): LighthouseImageAudit => ({
    score: audits[key]?.score ?? null,
    displayValue: audits[key]?.displayValue,
    items: audits[key]?.details?.items ?? [],
  })

  return {
    optimized: extract('uses-optimized-images'),
    nextGen: extract('uses-webp-images'),
    responsive: extract('uses-responsive-images'),
    offscreen: extract('offscreen-images'),
  }
}

function fmtKb(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} Ko` : `${bytes} o`
}

/** Analyse HTML fallback quand PageSpeed n'est pas configuré */
function analyzeHtml(html: string): SignalResult {
  const $ = load(html)
  const images = $('img').toArray()

  if (images.length === 0) {
    return { score: 100, status: 'good', details: { source: 'html', total: 0 }, recommendations: [], summary: 'Aucune image détectée' }
  }

  const total = images.length
  let withModernFormat = 0
  let withSrcset = 0
  let withDimensions = 0
  const legacyExamples: string[] = []

  for (const img of images) {
    const el = $(img)
    const src = (el.attr('src') ?? '').toLowerCase()
    const srcset = (el.attr('srcset') ?? '').toLowerCase()
    const inPicture = el.parent().is('picture')

    if (src.includes('.webp') || src.includes('.avif') || srcset.includes('.webp') || srcset.includes('.avif') || inPicture) {
      withModernFormat++
    } else if (src && !src.startsWith('data:')) {
      const name = src.split('/').pop()?.split('?')[0] ?? ''
      if (name) legacyExamples.push(name.slice(0, 40))
    }

    if (el.attr('srcset')) withSrcset++
    if (el.attr('width') && el.attr('height')) withDimensions++
  }

  const recommendations: string[] = []
  const issues: string[] = []

  const legacyCount = total - withModernFormat
  if (legacyCount > 0) {
    const ex = legacyExamples.slice(0, 3).join(', ')
    issues.push(`${legacyCount}/${total} images en format JPEG/PNG`)
    recommendations.push(
      `Convertir ${legacyCount} image${legacyCount > 1 ? 's' : ''} en WebP ou AVIF (${ex}) — gains de 25–50 % sur le poids sans perte de qualité visible.`
    )
  }
  if (withSrcset < Math.floor(total * 0.5) && total > 2) {
    issues.push(`Peu d'images responsives (srcset)`)
    recommendations.push(
      `Ajouter l'attribut srcset sur les images pour servir des résolutions adaptées selon l'écran — réduit le poids chargé sur mobile.`
    )
  }
  if (withDimensions < Math.floor(total * 0.8)) {
    const missing = total - withDimensions
    recommendations.push(
      `Ajouter width et height sur ${missing} image${missing > 1 ? 's' : ''} pour éviter les décalages de mise en page (CLS) lors du chargement.`
    )
  }

  let score: number
  if (issues.length === 0) score = 100
  else if (legacyCount / total <= 0.3) score = 75
  else if (legacyCount / total <= 0.6) score = 45
  else score = 20

  return {
    score,
    status: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical',
    details: { source: 'html', total, withModernFormat, legacyCount, withSrcset, withDimensions },
    recommendations,
    summary: issues.length === 0
      ? `${total} image${total > 1 ? 's' : ''} — formats et attributs corrects`
      : issues.join(' · '),
  }
}

export const imagesOptimization: Signal = {
  id: 'images_optimization',
  category: 'technique',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    // Pas de HTML → site inaccessible
    if (ctx.page.fetchError) {
      return { score: 0, status: 'skipped', details: { reason: 'Site inaccessible' }, recommendations: [] }
    }

    // PageSpeed disponible → données Lighthouse précises
    if (ctx.integrations.pagespeed?.apiKey) {
      try {
        const { optimized, nextGen, responsive, offscreen } = await fetchImageAudits(
          ctx.page.finalUrl,
          ctx.integrations.pagespeed.apiKey
        )

        const recommendations: string[] = []
        const issues: string[] = []
        let totalWasted = 0

        // Images compressibles
        if (optimized.score !== null && optimized.score < 0.9) {
          const wasted = optimized.items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0)
          totalWasted += wasted
          if (wasted > 50_000) {
            issues.push(`Images compressibles (${fmtKb(wasted)} économisables)`)
            const worst = optimized.items
              .sort((a, b) => (b.wastedBytes ?? 0) - (a.wastedBytes ?? 0))
              .slice(0, 3)
              .map(i => `${i.url.split('/').pop()?.split('?')[0]?.slice(0, 30)} (−${fmtKb(i.wastedBytes ?? 0)})`)
              .join(', ')
            recommendations.push(
              `Compresser ${optimized.items.length} image${optimized.items.length > 1 ? 's' : ''} — économie potentielle de ${fmtKb(wasted)} : ${worst}.`
            )
          }
        }

        // Formats modernes (WebP/AVIF)
        if (nextGen.score !== null && nextGen.score < 0.9) {
          const wasted = nextGen.items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0)
          totalWasted += wasted
          if (nextGen.items.length > 0) {
            issues.push(`${nextGen.items.length} image${nextGen.items.length > 1 ? 's' : ''} en format JPEG/PNG`)
            const examples = nextGen.items.slice(0, 3)
              .map(i => i.url.split('/').pop()?.split('?')[0]?.slice(0, 30))
              .filter(Boolean).join(', ')
            recommendations.push(
              `Convertir ${nextGen.items.length} image${nextGen.items.length > 1 ? 's' : ''} en WebP ou AVIF${wasted > 0 ? ` — économie de ${fmtKb(wasted)}` : ''} : ${examples}.`
            )
          }
        }

        // Images surdimensionnées
        if (responsive.score !== null && responsive.score < 0.9 && responsive.items.length > 0) {
          const wasted = responsive.items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0)
          totalWasted += wasted
          issues.push(`${responsive.items.length} image${responsive.items.length > 1 ? 's' : ''} surdimensionnée${responsive.items.length > 1 ? 's' : ''}`)
          recommendations.push(
            `Servir des images aux bonnes dimensions pour ${responsive.items.length} élément${responsive.items.length > 1 ? 's' : ''} — les images sont plus grandes que leur affichage${wasted > 0 ? ` (économie : ${fmtKb(wasted)})` : ''}.`
          )
        }

        // Images hors écran
        if (offscreen.score !== null && offscreen.score < 0.9 && offscreen.items.length > 0) {
          const wasted = offscreen.items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0)
          if (wasted > 100_000) {
            issues.push(`${offscreen.items.length} image${offscreen.items.length > 1 ? 's' : ''} hors écran chargées`)
            recommendations.push(
              `Différer le chargement de ${offscreen.items.length} image${offscreen.items.length > 1 ? 's' : ''} hors écran avec loading="lazy"${wasted > 0 ? ` — ${fmtKb(wasted)} chargés inutilement` : ''}.`
            )
          }
        }

        // Score global basé sur le total gaspillé et le nombre de problèmes
        let score: number
        if (issues.length === 0) score = 100
        else if (issues.length === 1 && totalWasted < 200_000) score = 75
        else if (issues.length <= 2 && totalWasted < 500_000) score = 50
        else score = 20

        return {
          score,
          status: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical',
          details: {
            source: 'pagespeed',
            totalWastedBytes: totalWasted,
            audits: { optimized: optimized.score, nextGen: nextGen.score, responsive: responsive.score, offscreen: offscreen.score },
          },
          recommendations,
          summary: issues.length === 0
            ? 'Images bien optimisées (Lighthouse)'
            : `${issues.join(' · ')}${totalWasted > 0 ? ` — ${fmtKb(totalWasted)} économisables` : ''}`,
        }
      } catch {
        // Fallback HTML si l'appel PageSpeed échoue
        return analyzeHtml(ctx.page.html)
      }
    }

    // Fallback : analyse HTML
    return analyzeHtml(ctx.page.html)
  },
}
