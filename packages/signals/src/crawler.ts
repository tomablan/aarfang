import { load } from 'cheerio'
import type { CrawlRow, CrawlData } from './types.js'

export interface CrawlOptions {
  maxPages: number                   // défaut 200
  delayMs: number                    // défaut 300ms
  contentTypes: ('html' | 'pdf')[]   // défaut ['html']
  respectRobots: boolean             // défaut true
}

export interface CrawlProgress {
  crawled: number
  discovered: number
  currentUrl: string
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 200,
  delayMs: 300,
  contentTypes: ['html'],
  respectRobots: true,
}

const UA = 'aarfang-bot/1.0 (respectful site audit; +https://aarfang.com/bot)'

async function fetchDisallowed(baseUrl: string): Promise<string[]> {
  const disallowed: string[] = []
  try {
    const res = await fetch(new URL('/robots.txt', baseUrl).href, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return disallowed
    const text = await res.text()
    let relevant = false
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (/^user-agent:/i.test(line)) {
        const agent = line.split(':')[1]?.trim().toLowerCase() ?? ''
        relevant = agent === '*' || agent.includes('aarfang')
      }
      if (relevant && /^disallow:/i.test(line)) {
        const path = line.split(':')[1]?.trim()
        if (path) disallowed.push(path)
      }
    }
  } catch { /* robots.txt inaccessible — on continue sans restriction */ }
  return disallowed
}

function isBlocked(pathname: string, disallowed: string[]): boolean {
  return disallowed.some((rule) => rule && pathname.startsWith(rule))
}

function collectLinks($: ReturnType<typeof load>, base: URL): string[] {
  const links: string[] = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    try {
      const u = new URL(href, base.href)
      u.hash = ''
      if (u.hostname === base.hostname && (u.protocol === 'http:' || u.protocol === 'https:')) {
        links.push(u.href)
      }
    } catch { /* url invalide */ }
  })
  return links
}

export async function crawlSite(
  siteUrl: string,
  options: Partial<CrawlOptions> = {},
  onProgress?: (p: CrawlProgress) => void,
): Promise<CrawlData> {
  const opts: CrawlOptions = { ...DEFAULT_CRAWL_OPTIONS, ...options }
  const base = new URL(siteUrl)

  const disallowed = opts.respectRobots ? await fetchDisallowed(siteUrl) : []

  // BFS avec Set pour les enqueued (O(1) instead of queue.includes)
  const queue: string[] = [base.href]
  const enqueued = new Set<string>([base.href])
  const visited = new Set<string>()
  const inlinkCount = new Map<string, number>()
  const depthMap = new Map<string, number>([[base.href, 0]])

  const rows: CrawlRow[] = []

  while (queue.length > 0 && rows.length < opts.maxPages) {
    const url = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)

    const parsed = new URL(url)
    if (opts.respectRobots && isBlocked(parsed.pathname, disallowed)) continue

    onProgress?.({ crawled: rows.length, discovered: enqueued.size, currentUrl: url })

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      })

      const ct = res.headers.get('content-type') ?? ''
      const isHtml = ct.includes('text/html')
      const isPdf = ct.includes('application/pdf')
      const depth = depthMap.get(url) ?? 0

      if (isHtml && opts.contentTypes.includes('html')) {
        const html = await res.text()
        const $ = load(html)

        const title = $('title').first().text().trim()
        const metaDescription = $('meta[name="description"]').attr('content')?.trim() ?? ''
        const h1 = $('h1').first().text().trim()
        const canonical = $('link[rel="canonical"]').attr('href')?.trim() ?? ''
        const metaRobots = $('meta[name="robots"]').attr('content')?.trim() ?? ''
        const indexable = res.status === 200 && !metaRobots.toLowerCase().includes('noindex')
        const wordCount = $('body').text().trim().split(/\s+/).filter(Boolean).length

        rows.push({
          url,
          statusCode: res.status,
          contentType: 'text/html',
          indexable,
          title,
          titleLength: title.length,
          metaDescription,
          metaDescriptionLength: metaDescription.length,
          h1,
          h1Count: $('h1').length,
          canonical,
          metaRobots,
          wordCount,
          crawlDepth: depth,
          inlinks: inlinkCount.get(url) ?? 0,
        })

        const links = collectLinks($, base)
        for (const link of links) {
          if (!enqueued.has(link)) {
            enqueued.add(link)
            queue.push(link)
            depthMap.set(link, depth + 1)
          }
          inlinkCount.set(link, (inlinkCount.get(link) ?? 0) + 1)
        }
      } else if (isPdf && opts.contentTypes.includes('pdf')) {
        rows.push({
          url,
          statusCode: res.status,
          contentType: 'application/pdf',
          indexable: false,
          title: parsed.pathname.split('/').pop() ?? '',
          titleLength: 0,
          metaDescription: '',
          metaDescriptionLength: 0,
          h1: '',
          h1Count: 0,
          canonical: '',
          metaRobots: '',
          wordCount: 0,
          crawlDepth: depth,
          inlinks: inlinkCount.get(url) ?? 0,
        })
      }
    } catch {
      // Timeout / erreur réseau — consigner si la page était liée depuis d'autres pages
      const inlinks = inlinkCount.get(url) ?? 0
      if (inlinks > 0) {
        rows.push({
          url,
          statusCode: 0,
          contentType: '',
          indexable: false,
          title: '',
          titleLength: 0,
          metaDescription: '',
          metaDescriptionLength: 0,
          h1: '',
          h1Count: 0,
          canonical: '',
          metaRobots: '',
          wordCount: 0,
          crawlDepth: depthMap.get(url) ?? 0,
          inlinks,
        })
      }
    }

    if (opts.delayMs > 0) {
      await new Promise<void>((r) => setTimeout(r, opts.delayMs))
    }
  }

  return { rows, totalUrls: rows.length, source: 'builtin' }
}
