import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const geoStructuredContent: Signal = {
  id: 'geo_structured_content',
  category: 'geo',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // Supprimer les éléments non-contenu pour l'analyse
    $('script, style, nav, header, footer, [class*="cookie"], [class*="banner"], [class*="popup"]').remove()

    const mainContent = $('main, article, [class*="content"], [class*="article"], body').first()
    const bodyText = mainContent.text().replace(/\s+/g, ' ').trim()
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length

    // ── 1. Structure de titres hiérarchiques ──
    const h2Count = $('h2').length
    const h3Count = $('h3').length
    const hasGoodHeadingStructure = h2Count >= 2 && (h2Count + h3Count) >= 3

    // ── 2. Listes structurées ──
    const ulCount = $('ul').length
    const olCount = $('ol').length
    const hasLists = (ulCount + olCount) >= 2

    // ── 3. Tableaux de données ──
    const tableCount = $('table').length
    const hasTables = tableCount >= 1

    // ── 4. Définitions (dl/dt/dd) ──
    const hasDefinitions = $('dl').length >= 1

    // ── 5. Longueur du contenu ──
    const hasSubstantialContent = wordCount >= 300
    const hasRichContent = wordCount >= 800

    // ── 6. Paragraphes (pas de mur de texte) ──
    const pCount = $('p').length
    const avgWordsPerParagraph = pCount > 0 ? wordCount / pCount : wordCount
    const hasReadableParagraphs = avgWordsPerParagraph <= 100 && pCount >= 3

    // ── 7. Citations ou blockquotes ──
    const hasBlockquotes = $('blockquote').length >= 1

    // ── Composite ──
    const checks = [
      hasGoodHeadingStructure,
      hasLists,
      hasTables || hasDefinitions,
      hasSubstantialContent,
      hasReadableParagraphs,
      hasBlockquotes || hasRichContent,
    ]
    const positiveCount = checks.filter(Boolean).length

    const details = {
      wordCount,
      h2Count, h3Count,
      ulCount, olCount,
      tableCount,
      hasDefinitions,
      hasBlockquotes,
      hasGoodHeadingStructure,
      hasLists,
      hasReadableParagraphs,
      avgWordsPerParagraph: Math.round(avgWordsPerParagraph),
    }

    if (positiveCount >= 5) {
      return {
        score: 100, status: 'good',
        details,
        recommendations: [],
        summary: `Contenu structuré pour LLMs — ${wordCount} mots, ${h2Count} H2, listes et tableaux`,
      }
    }

    if (positiveCount >= 3) {
      return {
        score: 70, status: 'warning',
        details,
        recommendations: [
          !hasGoodHeadingStructure ? 'Structurez votre contenu avec des titres H2 et H3 clairs — les LLMs utilisent ces titres pour extraire les sections pertinentes.' : '',
          !hasLists ? 'Utilisez des listes à puces pour les énumérations — elles facilitent l\'extraction des informations par les moteurs génératifs.' : '',
          !hasSubstantialContent ? `Votre page ne contient que ${wordCount} mots — un contenu de 500+ mots est plus susceptible d\'être retenu par les LLMs comme source complète.` : '',
          !hasReadableParagraphs ? 'Vos paragraphes sont trop longs — visez 50-80 mots par paragraphe pour une meilleure lisibilité machine.' : '',
        ].filter(Boolean),
        summary: 'Structure de contenu partielle',
      }
    }

    if (positiveCount >= 1) {
      return {
        score: 35, status: 'critical',
        details,
        recommendations: [
          'La structure du contenu n\'est pas optimisée pour les moteurs génératifs — les LLMs extraient le contenu via les balises sémantiques (titres, listes, tableaux).',
          'Ajoutez au minimum : 3 sections H2, 2 listes à puces, et au moins 400 mots de contenu substantiel.',
          'Organisez chaque page autour d\'une question principale avec une réponse directe dans les 100 premiers mots (principe du "inverted pyramid").',
          'Évitez les murs de texte : découpez en paragraphes courts et utilisez des sous-titres toutes les 200-300 mots.',
        ],
        summary: 'Contenu peu structuré pour les moteurs génératifs',
      }
    }

    return {
      score: 10, status: 'critical',
      details,
      recommendations: [
        'Contenu non structuré — un LLM ne peut pas extraire de contenu utile depuis cette page.',
        'Restructurez complètement en utilisant des titres hiérarchiques (H1 > H2 > H3), des listes et des paragraphes courts.',
        wordCount < 100 ? 'La page contient moins de 100 mots — les LLMs n\'indexent pas les pages trop courtes comme sources fiables.' : '',
      ].filter(Boolean),
      summary: 'Contenu non structuré (incompatible GEO)',
    }
  },
}
