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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const responseTimeMs = Date.now() - start
    return {
      html: '',
      headers: {},
      statusCode: 0,
      finalUrl: url,
      responseTimeMs,
      fetchError: msg,
      fetchErrorType: classifyFetchError(msg),
    }
  } finally {
    clearTimeout(timer)
  }
}

type FetchErrorType = 'ssl_expired' | 'ssl_invalid' | 'unreachable' | 'timeout' | 'network'

function classifyFetchError(msg: string): FetchErrorType {
  const m = msg.toUpperCase()
  if (m.includes('CERT_HAS_EXPIRED') || m.includes('CERTIFICATE_EXPIRED')) return 'ssl_expired'
  if (
    m.includes('SSL') || m.includes('TLS') || m.includes('CERT') ||
    m.includes('UNABLE_TO_VERIFY') || m.includes('DEPTH_ZERO_SELF_SIGNED') ||
    m.includes('SELF_SIGNED_CERT') || m.includes('ERR_SSL')
  ) return 'ssl_invalid'
  if (m.includes('ABORT') || m.includes('TIMED OUT') || m.includes('TIMEOUT')) return 'timeout'
  if (m.includes('ECONNREFUSED') || m.includes('ENOTFOUND') || m.includes('ECONNRESET')) return 'unreachable'
  return 'network'
}
