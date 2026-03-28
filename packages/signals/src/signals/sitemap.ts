import { URL } from 'node:url'
import type { Signal, SignalResult, AuditContext } from '../types.js'

// Chemins alternatifs courants selon le CMS ou la configuration
const CANDIDATE_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml',          // WordPress natif (5.5+)
  '/sitemap.php',
  '/sitemap.asp',
  '/sitemap.aspx',
  '/news-sitemap.xml',        // Google News
  '/video-sitemap.xml',
  '/image-sitemap.xml',
  '/post-sitemap.xml',        // Yoast SEO
  '/page-sitemap.xml',        // Yoast SEO
  '/product-sitemap.xml',     // e-commerce
  '/category-sitemap.xml',
]

async function trySitemap(url: string): Promise<{ urlCount: number; isIndex: boolean } | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const text = await res.text()
    const isXml = text.trim().startsWith('<?xml') || text.includes('<urlset') || text.includes('<sitemapindex')
    if (!isXml) return null
    const urlCount = (text.match(/<url>/g) ?? []).length
    const isIndex = text.includes('<sitemapindex')
    return { urlCount, isIndex }
  } catch {
    return null
  }
}

async function findInRobots(base: string): Promise<string[]> {
  const urls: string[] = []
  try {
    const res = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return urls
    const text = await res.text()
    for (const line of text.split('\n')) {
      const match = line.match(/^Sitemap:\s*(.+)/i)
      if (match) urls.push(match[1].trim())
    }
  } catch {}
  return urls
}

export const sitemap: Signal = {
  id: 'sitemap',
  category: 'seo_technique',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const base = new URL(ctx.page.finalUrl).origin

    // ── 1. Lire robots.txt pour trouver des déclarations Sitemap explicites ──
    const robotsSitemaps = await findInRobots(base)

    // ── 2. Tester les URL déclarées dans robots.txt en priorité ──
    for (const url of robotsSitemaps) {
      const result = await trySitemap(url)
      if (result) {
        const path = url.replace(base, '') || url
        const desc = result.isIndex ? `index de sitemaps` : `${result.urlCount} URL(s)`
        return {
          score: 100,
          status: 'good',
          details: { url, urlCount: result.urlCount, isIndex: result.isIndex, source: 'robots.txt' },
          recommendations: [],
          summary: `${desc} · ${path}`,
        }
      }
    }

    // ── 3. Tenter les chemins alternatifs courants ──
    for (const path of CANDIDATE_PATHS) {
      const url = `${base}${path}`
      const result = await trySitemap(url)
      if (result) {
        const desc = result.isIndex ? `index de sitemaps` : `${result.urlCount} URL(s)`
        return {
          score: 100,
          status: 'good',
          details: { url, urlCount: result.urlCount, isIndex: result.isIndex, source: 'discovery' },
          recommendations: [],
          summary: `${desc} · ${path}`,
        }
      }
    }

    // ── 4. Sitemap non trouvé ──
    const checkedPaths = [...robotsSitemaps.map((u) => u.replace(base, '')), ...CANDIDATE_PATHS].slice(0, 6).join(', ')
    return {
      score: 0,
      status: 'critical',
      details: { checked: checkedPaths, robotsSitemaps },
      recommendations: [
        'Aucun sitemap détecté — sans sitemap, Google doit découvrir vos pages en suivant les liens, ce qui peut laisser des pages stratégiques non indexées pendant des semaines.',
        'Déclarez l\'URL du sitemap dans robots.txt avec la directive `Sitemap: https://votre-site.com/sitemap.xml` pour le rendre trouvable automatiquement par tous les moteurs.',
        'La plupart des CMS génèrent un sitemap automatiquement : WordPress (extension Yoast ou natif), Shopify, Webflow, etc.',
      ],
      summary: `Aucun sitemap détecté (${CANDIDATE_PATHS.length} chemins testés)`,
    }
  },
}
