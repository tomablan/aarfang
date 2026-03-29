import type { AuditContext, FetchedPage, IntegrationCredentials, CrawlData } from './types.js'

const USER_AGENT = 'Mozilla/5.0 (compatible; Aarfang/1.0; +https://aarfang.com)'
const FETCH_TIMEOUT_MS = 15_000

export async function buildAuditContext(
  site: { id: string; url: string; name: string; cmsType: string | null; isEcommerce: boolean },
  integrations: IntegrationCredentials = {},
  crawl?: CrawlData
): Promise<AuditContext> {
  const page = await fetchPage(site.url)
  return { site, page, integrations, ...(crawl ? { crawl } : {}) }
}

async function fetchPage(url: string): Promise<FetchedPage> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    })
    const html = await response.text()
    const responseTimeMs = Date.now() - start
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value })

    return {
      html,
      headers,
      statusCode: response.status,
      finalUrl: response.url,
      responseTimeMs,
    }
  } finally {
    clearTimeout(timer)
  }
}
