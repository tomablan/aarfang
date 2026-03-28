import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const accessibilityStructure: Signal = {
  id: 'accessibility_structure',
  category: 'accessibilite',
  weight: 2,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // ── 1. Attribut lang sur <html> ──────────────────────────────────────────
    const htmlLang = $('html').attr('lang')
    const hasLang = !!htmlLang && htmlLang.trim().length >= 2

    // ── 2. Hiérarchie des titres (pas de saut de niveau) ────────────────────
    const headingLevels: number[] = []
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      headingLevels.push(parseInt((el as any).tagName.slice(1), 10))
    })

    const headingSkips: string[] = []
    for (let i = 1; i < headingLevels.length; i++) {
      const diff = headingLevels[i] - headingLevels[i - 1]
      if (diff > 1) {
        headingSkips.push(`H${headingLevels[i - 1]} → H${headingLevels[i]}`)
      }
    }
    const uniqueSkips = [...new Set(headingSkips)]

    // ── 3. Landmark HTML5 (structure sémantique) ────────────────────────────
    const hasMain = $('main, [role="main"]').length > 0
    const hasNav = $('nav, [role="navigation"]').length > 0
    const hasHeader = $('header, [role="banner"]').length > 0
    const hasFooter = $('footer, [role="contentinfo"]').length > 0

    // ── 4. Skip link (lien "Aller au contenu principal") ────────────────────
    const hasSkipLink = $('a[href^="#"]').toArray().some((el) => {
      const text = $(el).text().toLowerCase()
      return (
        text.includes('contenu') || text.includes('content') ||
        text.includes('principal') || text.includes('main') ||
        text.includes('skip') || text.includes('aller')
      )
    })

    // ── 5. Balise <title> présente ──────────────────────────────────────────
    const hasTitle = !!$('title').text().trim()

    // ── 6. Images décoratives avec alt="" (bonne pratique) vs images sans alt ──
    const allImgs = $('img').toArray()
    const imgsWithoutAlt = allImgs.filter((el) => $(el).attr('alt') === undefined).length
    const imgsWithEmptyAlt = allImgs.filter((el) => $(el).attr('alt') === '').length // OK = décoratif

    // ── 7. Éléments <table> sans caption ou summary ─────────────────────────
    const tables = $('table').toArray()
    const tablesWithoutCaption = tables.filter((el) => {
      const isLayout = $(el).attr('role') === 'presentation' || $(el).attr('aria-hidden') === 'true'
      if (isLayout) return false
      return $('caption', el).length === 0 && !$(el).attr('aria-label') && !$(el).attr('aria-labelledby')
    }).length

    // ── Score ────────────────────────────────────────────────────────────────
    const checks = [
      { key: 'lang',      passed: hasLang,    weight: 3, label: `attribut lang sur <html> (${htmlLang || 'absent'})` },
      { key: 'main',      passed: hasMain,    weight: 2, label: 'élément <main>' },
      { key: 'nav',       passed: hasNav,     weight: 1, label: 'élément <nav>' },
      { key: 'header',    passed: hasHeader,  weight: 1, label: 'élément <header>' },
      { key: 'footer',    passed: hasFooter,  weight: 1, label: 'élément <footer>' },
      { key: 'title',     passed: hasTitle,   weight: 2, label: 'balise <title>' },
      { key: 'headings',  passed: uniqueSkips.length === 0, weight: 2, label: 'hiérarchie des titres sans saut' },
      { key: 'skipLink',  passed: hasSkipLink, weight: 1, label: 'lien d\'évitement (skip link)' },
    ]

    const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
    const earnedWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0)
    const ratio = earnedWeight / totalWeight

    const recommendations: string[] = []

    if (!hasLang) {
      recommendations.push(
        'Attribut lang manquant sur <html> — les lecteurs d\'écran ne peuvent pas choisir la bonne voix de synthèse. Ajouter lang="fr" (ou la langue du site).',
      )
    }
    if (!hasMain) {
      recommendations.push(
        'Aucun élément <main> détecté — les utilisateurs de lecteurs d\'écran ne peuvent pas naviguer directement au contenu principal. Entourer le contenu principal d\'une balise <main>.',
      )
    }
    if (uniqueSkips.length > 0) {
      recommendations.push(
        `Sauts de niveau dans la hiérarchie des titres : ${uniqueSkips.join(', ')} — respecter l'ordre H1→H2→H3 sans sauter de niveau pour une navigation cohérente au clavier.`,
      )
    }
    if (!hasSkipLink) {
      recommendations.push(
        'Pas de lien d\'évitement ("Aller au contenu principal") — essentiel pour les utilisateurs naviguant au clavier qui doivent traverser le menu à chaque page (WCAG 2.4.1).',
      )
    }
    if (imgsWithoutAlt > 0) {
      recommendations.push(
        `${imgsWithoutAlt} image${imgsWithoutAlt > 1 ? 's' : ''} sans attribut alt — les lecteurs d'écran liront l'URL de l'image. Ajouter alt="" pour les images décoratives, ou un texte descriptif pour les images informatives.`,
      )
    }
    if (tablesWithoutCaption > 0) {
      recommendations.push(
        `${tablesWithoutCaption} tableau${tablesWithoutCaption > 1 ? 'x' : ''} de données sans <caption> ni aria-label — les tableaux doivent avoir un titre pour être compréhensibles hors contexte visuel.`,
      )
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (ratio >= 0.9)       { score = 100; status = 'good'     }
    else if (ratio >= 0.75) { score = 80;  status = 'good'     }
    else if (ratio >= 0.60) { score = 60;  status = 'warning'  }
    else if (ratio >= 0.40) { score = 35;  status = 'critical' }
    else                    { score = 10;  status = 'critical' }

    const passing = checks.filter((c) => c.passed).map((c) => c.label)
    const failing = checks.filter((c) => !c.passed).map((c) => c.label)

    return {
      score,
      status,
      details: {
        lang: { present: hasLang, value: htmlLang ?? null },
        landmarks: { main: hasMain, nav: hasNav, header: hasHeader, footer: hasFooter },
        headings: { levels: headingLevels, skips: uniqueSkips },
        skipLink: hasSkipLink,
        images: { withoutAlt: imgsWithoutAlt, decorative: imgsWithEmptyAlt },
        tables: { withoutCaption: tablesWithoutCaption },
        passing,
        failing,
      },
      recommendations: recommendations.length > 0 ? recommendations : ['Structure documentaire conforme aux bonnes pratiques WCAG 2.1.'],
      summary: failing.length === 0
        ? 'Structure HTML accessible (lang, landmarks, hiérarchie)'
        : `${passing.length}/${checks.length} critères OK — manque : ${failing.slice(0, 3).join(', ')}${failing.length > 3 ? '…' : ''}`,
    }
  },
}
