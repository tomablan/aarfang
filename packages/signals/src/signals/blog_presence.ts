import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const blogPresence: Signal = {
  id: 'blog_presence',
  category: 'opportunites',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const html = ctx.page.html.toLowerCase()

    // ── 1. Liens de navigation vers un blog / section actualités ──
    const blogNavKeywords = [
      'blog', 'actualités', 'actualites', 'news', 'articles', 'ressources',
      'conseils', 'dossiers', 'magazine', 'édito', 'edito',
    ]
    const navLinks: string[] = []
    $('nav a, header a').each((_, el) => {
      const text = $(el).text().toLowerCase().trim()
      const href = ($(el).attr('href') ?? '').toLowerCase()
      navLinks.push(text + ' ' + href)
    })
    const hasBlogNav = blogNavKeywords.some((kw) =>
      navLinks.some((l) => l.includes(kw))
    )

    // ── 2. Chemins URL courants pour un blog ──
    const blogUrlPatterns = [
      '/blog', '/actualites', '/actualités', '/news', '/articles',
      '/ressources', '/conseils', '/magazine',
    ]
    const hasBlogUrl = blogUrlPatterns.some((p) => html.includes(p))

    // ── 3. Flux RSS / Atom ──
    const hasRss =
      $('link[type="application/rss+xml"], link[type="application/atom+xml"]').length > 0 ||
      html.includes('/feed') || html.includes('/rss')

    // ── 4. Schema.org BlogPosting ou Article ──
    let hasBlogSchema = false
    $('script[type="application/ld+json"]').each((_, el) => {
      const content = ($(el).html() ?? '').toLowerCase()
      if (content.includes('"blogposting"') || content.includes('"article"')) {
        hasBlogSchema = true
      }
    })

    // ── 5. Articles en page (cards avec date) ──
    const hasArticleCards =
      $('article').length >= 2 ||
      ($('time').length >= 2 && $('h2, h3').length >= 3)

    const detected = hasBlogNav || hasBlogUrl || hasRss || hasBlogSchema || hasArticleCards

    if (detected) {
      return {
        score: 100,
        status: 'good',
        details: { hasBlogNav, hasBlogUrl, hasRss, hasBlogSchema, hasArticleCards },
        recommendations: [],
        summary: 'Blog / section actualités détecté',
      }
    }

    return {
      score: 20,
      status: 'critical',
      details: { detected: false },
      recommendations: [
        'Aucune section blog ou actualités détectée — les sites qui publient régulièrement du contenu obtiennent en moyenne 3× plus de trafic organique que ceux qui n\'en publient pas.',
        'Un blog positionne votre entreprise comme experte dans son domaine et alimente les réseaux sociaux sans effort créatif supplémentaire.',
        ctx.site.isEcommerce
          ? 'Pour un e-commerce, des guides d\'achat et comparatifs capturent des requêtes à haute intention commerciale (ex : "meilleur [produit] 2025").'
          : 'Pour un service B2B, 2 articles par mois suffisent pour générer des leads qualifiés via le SEO de longue traîne.',
      ],
      summary: 'Aucun blog ni section actualités',
    }
  },
}
