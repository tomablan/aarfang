import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const geoFaqSchema: Signal = {
  id: 'geo_faq_schema',
  category: 'geo',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // ── 1. FAQPage ou HowTo JSON-LD ──
    let hasFaqSchema = false
    let hasHowToSchema = false
    let faqCount = 0
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}')
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item['@type'] === 'FAQPage') {
            hasFaqSchema = true
            faqCount = Array.isArray(item.mainEntity) ? item.mainEntity.length : 0
          }
          if (item['@type'] === 'HowTo') hasHowToSchema = true
        }
      } catch {}
    })

    // ── 2. Section FAQ HTML ──
    const faqSelectors = [
      '[class*="faq"]', '[id*="faq"]',
      '[class*="accordion"]', '[class*="accordeon"]',
      '[class*="questions"]', '[id*="questions"]',
      '[class*="q-and-a"]', '[class*="q&a"]',
    ]
    let hasFaqHtml = false
    for (const sel of faqSelectors) {
      try { if ($(sel).length > 0) { hasFaqHtml = true; break } } catch {}
    }

    // ── 3. Balises <details>/<summary> (FAQ native HTML5) ──
    const detailsCount = $('details').length
    const hasDetailsPattern = detailsCount >= 2

    // ── 4. Structure question/réponse dans le corps (h3 + p consécutifs) ──
    let hasQaPattern = false
    const h3s = $('h3, h4').toArray()
    let qaCount = 0
    for (const el of h3s) {
      const text = $(el).text().trim()
      if (text.endsWith('?') || text.toLowerCase().startsWith('comment') ||
          text.toLowerCase().startsWith('pourquoi') || text.toLowerCase().startsWith('qu\'') ||
          text.toLowerCase().startsWith('quel') || text.toLowerCase().startsWith('est-ce')) {
        qaCount++
      }
    }
    if (qaCount >= 3) hasQaPattern = true

    const details = { hasFaqSchema, hasHowToSchema, faqCount, hasFaqHtml, hasDetailsPattern, detailsCount, qaCount }

    if (hasFaqSchema && (hasFaqHtml || hasDetailsPattern)) {
      return {
        score: 100, status: 'good',
        details,
        recommendations: [],
        summary: `FAQPage JSON-LD (${faqCount} Q&A) + structure HTML — idéal pour les Featured Snippets et les LLMs`,
      }
    }

    if (hasFaqSchema) {
      return {
        score: 85, status: 'good',
        details,
        recommendations: [
          'Le schema FAQPage est présent. Ajouter une section FAQ visuellement identifiable en HTML renforcera la cohérence et l\'extraction par les LLMs.',
        ],
        summary: `FAQPage JSON-LD présent (${faqCount} questions)`,
      }
    }

    if (hasFaqHtml || hasDetailsPattern || hasQaPattern) {
      return {
        score: 55, status: 'warning',
        details,
        recommendations: [
          'Des questions/réponses HTML sont détectées mais sans schema FAQPage JSON-LD — ajoutez-le pour apparaître dans les Featured Snippets Google et être cité par les LLMs.',
          'Le schema FAQPage indique explicitement aux moteurs génératifs quelles questions vous répondez, augmentant vos chances d\'être cité.',
        ],
        summary: 'FAQ HTML présente sans schema JSON-LD',
      }
    }

    return {
      score: 15, status: 'critical',
      details,
      recommendations: [
        'Aucune FAQ structurée détectée — les moteurs d\'IA (Google SGE, Perplexity, ChatGPT) sélectionnent en priorité les sources qui répondent directement à des questions.',
        'Créez une section FAQ avec les 5-8 questions les plus fréquentes de vos prospects et implémentez le schema FAQPage JSON-LD.',
        'Les pages avec FAQPage schema obtiennent en moyenne 30% de clics supplémentaires via les rich snippets.',
        hasHowToSchema ? '' : 'Si votre activité implique des processus, ajoutez un schema HowTo pour apparaître dans les guides étape par étape des IA.',
      ].filter(Boolean),
      summary: 'Aucune FAQ structurée (signal GEO critique)',
    }
  },
}
