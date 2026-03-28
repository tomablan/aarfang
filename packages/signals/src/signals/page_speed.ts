import type { Signal, SignalResult, AuditContext } from '../types.js'

interface PSIResult {
  score: number
  lcp: number | null
  fid: number | null
  cls: number | null
  ttfb: number | null
  lcpElement: string | null
}

async function fetchPSI(url: string, strategy: 'mobile' | 'desktop', apiKey?: string | null): Promise<PSIResult> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
    ...(apiKey ? { key: apiKey } : {}),
  })
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`PageSpeed API error: ${res.status}`)

  const data = await res.json() as any
  const cats = data.lighthouseResult?.categories
  const metrics = data.lighthouseResult?.audits

  const lcpItems = metrics?.['largest-contentful-paint-element']?.details?.items ?? []
  const lcpNode = lcpItems[0]?.node
  const lcpElement: string | null = lcpNode?.nodeLabel ?? lcpNode?.snippet ?? null

  return {
    score: Math.round((cats?.performance?.score ?? 0) * 100),
    lcp: metrics?.['largest-contentful-paint']?.numericValue ?? null,
    fid: metrics?.['total-blocking-time']?.numericValue ?? null,
    cls: metrics?.['cumulative-layout-shift']?.numericValue ?? null,
    ttfb: metrics?.['server-response-time']?.numericValue ?? null,
    lcpElement,
  }
}

export const pageSpeed: Signal = {
  id: 'page_speed',
  category: 'technique',
  weight: 4,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    try {
      const apiKey = ctx.integrations.pagespeed?.apiKey
      if (!apiKey) {
        return { score: 0, status: 'skipped', details: { reason: 'PageSpeed integration not configured' }, recommendations: ['Configurer l\'intégration PageSpeed Insights dans les paramètres de l\'organisation.'] }
      }
      const [mobile, desktop] = await Promise.all([
        fetchPSI(ctx.page.finalUrl, 'mobile', apiKey),
        fetchPSI(ctx.page.finalUrl, 'desktop', apiKey),
      ])

      const score = Math.round((mobile.score * 0.6 + desktop.score * 0.4))
      const status = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical'
      const recommendations: string[] = []

      if (mobile.score < 50) recommendations.push('Performance mobile critique — optimiser les images, réduire le JavaScript bloquant.')
      if (mobile.lcp && mobile.lcp > 4000) {
        const elementHint = mobile.lcpElement ? ` Élément concerné : ${mobile.lcpElement}.` : ''
        recommendations.push(`LCP mobile trop élevé (${(mobile.lcp / 1000).toFixed(1)}s).${elementHint} Cible : < 2.5s.`)
      }
      if (mobile.cls && mobile.cls > 0.25) recommendations.push(`CLS mobile élevé (${mobile.cls.toFixed(3)}). Cible : < 0.1.`)

      const summary = `Mobile ${mobile.score}/100 · Desktop ${desktop.score}/100${mobile.lcp ? ` · LCP ${(mobile.lcp / 1000).toFixed(1)}s` : ''}`
      return {
        score,
        status,
        details: { mobile, desktop },
        recommendations,
        summary,
      }
    } catch (err) {
      return { score: 0, status: 'skipped', details: { error: String(err) }, recommendations: [] }
    }
  },
}
