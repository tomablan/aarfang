import { URL } from 'node:url'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const sitemap: Signal = {
  id: 'sitemap',
  category: 'seo_technique',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const base = new URL(ctx.page.finalUrl).origin
    const sitemapUrl = `${base}/sitemap.xml`

    try {
      const res = await fetch(sitemapUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const text = await res.text()
        const isXml = text.trim().startsWith('<?xml') || text.includes('<urlset') || text.includes('<sitemapindex')
        if (isXml) {
          const urlCount = (text.match(/<url>/g) ?? []).length
          return { score: 100, status: 'good', details: { url: sitemapUrl, urlCount }, recommendations: [], summary: `${urlCount} URL(s) indexées · ${sitemapUrl}` }
        }
        return { score: 40, status: 'warning', details: { url: sitemapUrl, issue: 'not valid XML' }, recommendations: ['Le fichier sitemap.xml ne semble pas être un XML valide.'], summary: `sitemap.xml présent mais XML invalide` }
      }
      return { score: 0, status: 'critical', details: { url: sitemapUrl, statusCode: res.status }, recommendations: ['Créer et exposer un sitemap.xml pour faciliter l\'indexation.'], summary: `sitemap.xml absent (HTTP ${res.status})` }
    } catch {
      return { score: 0, status: 'critical', details: { url: sitemapUrl, error: 'unreachable' }, recommendations: ['Créer et exposer un sitemap.xml pour faciliter l\'indexation.'], summary: 'sitemap.xml inaccessible' }
    }
  },
}
