import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

/** Extrait les mots significatifs d'une chaîne (ignore stopwords FR/EN et mots courts). */
function significantWords(text: string): string[] {
  const stopwords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux',
    'ce', 'se', 'sa', 'son', 'ses', 'sur', 'par', 'pour', 'dans', 'avec', 'est',
    'the', 'a', 'an', 'of', 'in', 'to', 'and', 'for', 'on', 'at', 'by', 'is',
    'your', 'our', 'we', 'you', 'it', 'its', 'are', 'be', 'or', 'as', 'from',
  ])
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w))
}

/** Retourne vrai si `text` contient au moins un des mots de `keywords`. */
function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

/** Extrait le chemin URL sans le nom de domaine. */
function urlPath(url: string): string {
  try { return new URL(url).pathname.toLowerCase() } catch { return '' }
}

export const keywordConsistency: Signal = {
  id: 'keyword_consistency',
  category: 'seo_technique',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // — Extraction du titre de la page
    const pageTitle = $('title').first().text().trim()
    if (!pageTitle) {
      return {
        score: 0,
        status: 'critical',
        details: { reason: 'Balise <title> absente — impossible d\'analyser la cohérence des mots-clés.' },
        recommendations: ['Ajouter une balise <title> décrivant le sujet principal de la page.'],
        summary: 'Balise <title> manquante',
      }
    }

    const keywords = significantWords(pageTitle)
    if (keywords.length === 0) {
      return {
        score: 20,
        status: 'warning',
        details: { title: pageTitle, keywords: [] },
        recommendations: ['Le titre ne contient pas de mot-clé significatif — le rendre plus descriptif.'],
        summary: `Titre sans mot-clé significatif : "${pageTitle}"`,
      }
    }

    // — Vérification de la présence du mot-clé dans chaque élément
    const h1Text = $('h1').first().text().trim()
    const metaDesc = $('meta[name="description"]').attr('content') ?? ''
    const firstParagraph = $('p').first().text().trim()
    const path = urlPath(ctx.page.finalUrl)

    const checks = {
      h1:          { label: 'H1',               found: h1Text  ? containsKeyword(h1Text, keywords)       : false, value: h1Text  || '(absent)' },
      metaDesc:    { label: 'Meta description', found: metaDesc? containsKeyword(metaDesc, keywords)     : false, value: metaDesc|| '(absente)' },
      firstPara:   { label: 'Premier paragraphe', found: firstParagraph ? containsKeyword(firstParagraph, keywords) : false, value: firstParagraph.slice(0, 80) || '(absent)' },
      url:         { label: 'URL',              found: containsKeyword(path, keywords),                           value: path || '/' },
    }

    const found = Object.values(checks).filter((c) => c.found).length
    const total  = Object.keys(checks).length
    const missing = Object.entries(checks).filter(([, c]) => !c.found).map(([, c]) => c.label)

    const recommendations: string[] = []

    if (!checks.h1.found) {
      recommendations.push(
        checks.h1.value === '(absent)'
          ? 'Ajouter une balise H1 contenant le mot-clé principal.'
          : `La balise H1 ("${checks.h1.value.slice(0, 60)}") ne contient pas le mot-clé principal — l'aligner avec le title.`,
      )
    }
    if (!checks.metaDesc.found) {
      recommendations.push(
        checks.metaDesc.value === '(absente)'
          ? 'Ajouter une meta description contenant le mot-clé principal.'
          : 'Inclure le mot-clé principal dans la meta description pour améliorer le CTR.',
      )
    }
    if (!checks.firstPara.found && firstParagraph) {
      recommendations.push('Mentionner le mot-clé principal dans le premier paragraphe de la page.')
    }
    if (!checks.url.found) {
      recommendations.push('Inclure le mot-clé principal dans l\'URL de la page (slug).')
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (found === total)      { score = 100; status = 'good'     }
    else if (found >= 3)      { score = 80;  status = 'good'     }
    else if (found === 2)     { score = 55;  status = 'warning'  }
    else if (found === 1)     { score = 30;  status = 'critical' }
    else                      { score = 5;   status = 'critical' }

    const kw = keywords.slice(0, 3).join(', ')

    return {
      score,
      status,
      details: {
        title: pageTitle,
        keywords: keywords.slice(0, 5),
        checks: Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, { found: c.found, value: c.value }])),
        found,
        total,
        missing,
      },
      recommendations,
      summary: found === total
        ? `Mots-clés cohérents sur tous les éléments (${kw})`
        : `${found}/${total} éléments contiennent le mot-clé — manque : ${missing.join(', ')}`,
    }
  },
}
