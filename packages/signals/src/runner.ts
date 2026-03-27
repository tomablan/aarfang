import type { Signal, AuditContext, AuditSignalResult } from './types.js'
import { httpsEnabled } from './signals/https_enabled.js'
import { sslExpiry } from './signals/ssl_expiry.js'
import { securityHeaders } from './signals/security_headers.js'
import { metaTitle } from './signals/meta_title.js'
import { metaDescription } from './signals/meta_description.js'
import { h1Tag } from './signals/h1_tag.js'
import { canonicalTag } from './signals/canonical_tag.js'
import { sitemap } from './signals/sitemap.js'
import { robotsTxt } from './signals/robots_txt.js'
import { structuredData } from './signals/structured_data.js'
import { imagesAlt } from './signals/images_alt.js'
import { openGraph } from './signals/open_graph.js'
import { pageSpeed } from './signals/page_speed.js'
import { serverResponseTime } from './signals/server_response_time.js'
import { viewportMeta } from './signals/viewport_meta.js'
import { ctaPresence } from './signals/cta_presence.js'
import { phoneVisible } from './signals/phone_visible.js'
import { contactForm } from './signals/contact_form.js'
import { crawlDuplicateTitles } from './signals/crawl_duplicate_titles.js'
import { crawlBrokenPages } from './signals/crawl_broken_pages.js'
import { crawlRedirects } from './signals/crawl_redirects.js'
import { crawlThinContent } from './signals/crawl_thin_content.js'
import { crawlDepth } from './signals/crawl_depth.js'
import { crawlNoindex } from './signals/crawl_noindex.js'

// Registre de tous les signaux disponibles
export const ALL_SIGNALS: Signal[] = [
  // Sécurité
  httpsEnabled,
  sslExpiry,
  securityHeaders,
  // SEO Technique
  metaTitle,
  metaDescription,
  h1Tag,
  canonicalTag,
  sitemap,
  robotsTxt,
  structuredData,
  imagesAlt,
  openGraph,
  // Technique
  pageSpeed,
  serverResponseTime,
  viewportMeta,
  // Opportunités
  ctaPresence,
  phoneVisible,
  contactForm,
  // SEO Technique — Crawl (Screaming Frog)
  crawlDuplicateTitles,
  crawlBrokenPages,
  crawlRedirects,
  crawlThinContent,
  crawlDepth,
  crawlNoindex,
]

export async function runSignals(ctx: AuditContext): Promise<AuditSignalResult[]> {
  const results = await Promise.allSettled(
    ALL_SIGNALS.map(async (signal) => {
      try {
        const result = await signal.analyze(ctx)
        return { signalId: signal.id, category: signal.category, ...result } satisfies AuditSignalResult
      } catch (err) {
        // Un signal qui crash → skipped, pas de plantage de l'audit
        return {
          signalId: signal.id,
          category: signal.category,
          score: 0,
          status: 'skipped' as const,
          details: { error: String(err) },
          recommendations: [],
        } satisfies AuditSignalResult
      }
    })
  )

  return results
    .filter((r): r is PromiseFulfilledResult<AuditSignalResult> => r.status === 'fulfilled')
    .map((r) => r.value)
}
