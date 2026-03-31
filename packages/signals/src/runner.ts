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
import { imagesOptimization } from './signals/images_optimization.js'
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
import { crawlInternalLinking } from './signals/crawl_internal_linking.js'
import { crawlCannibalization } from './signals/crawl_cannibalization.js'
import { crawlMetaCoverage } from './signals/crawl_meta_coverage.js'
import { gscSearchPerformance } from './signals/gsc_search_performance.js'
import { cookieConsent } from './signals/cookie_consent.js'
import { legalPages } from './signals/legal_pages.js'
import { localSchema } from './signals/local_schema.js'
import { reviewSchema } from './signals/review_schema.js'
import { coreWebVitals } from './signals/core_web_vitals.js'
import { socialPresence } from './signals/social_presence.js'
import { trustSignals } from './signals/trust_signals.js'
import { liveChat } from './signals/live_chat.js'
import { keywordConsistency } from './signals/keyword_consistency.js'
import { gscKeywordOpportunities } from './signals/gsc_keyword_opportunities.js'
import { accessibilityInteractive } from './signals/accessibility_interactive.js'
import { accessibilityStructure } from './signals/accessibility_structure.js'
import { analyticsSetup } from './signals/analytics_setup.js'
import { googleAdsTag } from './signals/google_ads_tag.js'
import { metaPixel } from './signals/meta_pixel.js'
import { seaReadiness } from './signals/sea_readiness.js'
import { landingPageDetection } from './signals/landing_page_detection.js'
import { leadCapture } from './signals/lead_capture.js'
import { blogPresence } from './signals/blog_presence.js'
import { contentFreshness } from './signals/content_freshness.js'
import { videoPresence } from './signals/video_presence.js'
import { pricingPage } from './signals/pricing_page.js'
import { ecoPageWeight } from './signals/eco_page_weight.js'
import { ecoCompression } from './signals/eco_compression.js'
import { ecoCachePolicy } from './signals/eco_cache_policy.js'
import { ecoImageOptimization } from './signals/eco_image_optimization.js'
import { ecoThirdPartyScripts } from './signals/eco_third_party_scripts.js'
import { ecoFonts } from './signals/eco_fonts.js'

// Registre de tous les signaux disponibles
export const ALL_SIGNALS: Signal[] = [
  // Sécurité
  httpsEnabled,
  sslExpiry,
  securityHeaders,
  cookieConsent,
  legalPages,
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
  coreWebVitals,
  serverResponseTime,
  viewportMeta,
  imagesOptimization,
  // Opportunités
  ctaPresence,
  phoneVisible,
  contactForm,
  socialPresence,
  trustSignals,
  liveChat,
  gscKeywordOpportunities,
  leadCapture,
  blogPresence,
  videoPresence,
  pricingPage,
  // SEO Local — Google Search Console + schémas locaux
  gscSearchPerformance,
  localSchema,
  reviewSchema,
  keywordConsistency,
  contentFreshness,
  // SEO Technique — Crawl (Screaming Frog)
  crawlDuplicateTitles,
  crawlBrokenPages,
  crawlRedirects,
  crawlThinContent,
  crawlDepth,
  crawlNoindex,
  crawlInternalLinking,
  crawlCannibalization,
  crawlMetaCoverage,
  // Accessibilité WCAG
  accessibilityInteractive,
  accessibilityStructure,
  // SEA — Search Engine Advertising
  analyticsSetup,
  googleAdsTag,
  metaPixel,
  seaReadiness,
  landingPageDetection,
  // Éco-conception
  ecoPageWeight,
  ecoCompression,
  ecoCachePolicy,
  ecoImageOptimization,
  ecoThirdPartyScripts,
  ecoFonts,
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
