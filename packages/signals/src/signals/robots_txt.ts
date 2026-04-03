import { URL } from 'node:url'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const robotsTxt: Signal = {
  id: 'robots_txt',
  category: 'seo_technique',
  weight: 1,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const base = new URL(ctx.page.finalUrl).origin
    const robotsUrl = `${base}/robots.txt`

    try {
      const res = await fetch(robotsUrl, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (!res.ok) {
        return { score: 20, status: 'warning', details: { url: robotsUrl, statusCode: res.status }, recommendations: ['Créer un fichier robots.txt pour contrôler l\'indexation.'], summary: `robots.txt absent (HTTP ${res.status})` }
      }
      const text = await res.text()
      // Vérifier uniquement si le bloc User-agent: * contient exactement Disallow: /
      const hasDisallowAll = (() => {
        const lines = text.split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean)
        let inStarBlock = false
        for (const line of lines) {
          if (/^User-agent:\s*\*$/i.test(line)) { inStarBlock = true; continue }
          if (/^User-agent:/i.test(line)) { inStarBlock = false; continue }
          if (inStarBlock && /^Disallow:\s*\/\s*$/i.test(line)) return true
        }
        return false
      })()
      const hasSitemapRef = /Sitemap:/i.test(text)

      if (hasDisallowAll) {
        return { score: 20, status: 'critical', details: { url: robotsUrl, hasDisallowAll, hasSitemapRef }, recommendations: ['Le fichier robots.txt bloque tout le crawl (Disallow: /). Vérifier la configuration.'], summary: 'Disallow: / détecté — crawl entièrement bloqué' }
      }
      const score = hasSitemapRef ? 100 : 80
      const recommendations = hasSitemapRef ? [] : ['Ajouter une référence au sitemap.xml dans robots.txt.']
      const summary = hasSitemapRef ? 'robots.txt valide avec référence sitemap' : 'robots.txt présent mais sans référence au sitemap'
      return { score, status: score === 100 ? 'good' : 'warning', details: { url: robotsUrl, hasSitemapRef, hasDisallowAll }, recommendations, summary }
    } catch {
      return { score: 0, status: 'warning', details: { url: robotsUrl, error: 'unreachable' }, recommendations: ['Créer un fichier robots.txt accessible.'], summary: 'robots.txt inaccessible' }
    }
  },
}
