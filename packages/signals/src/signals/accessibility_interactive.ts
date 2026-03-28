import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const accessibilityInteractive: Signal = {
  id: 'accessibility_interactive',
  category: 'accessibilite',
  weight: 3,

  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)

    // ── 1. Inputs de formulaire sans label associé ──────────────────────────
    const inputTypes = ['text', 'email', 'tel', 'password', 'search', 'number', 'url', 'date', 'textarea']
    const formInputs = $('input, textarea, select').toArray().filter((el) => {
      const type = $(el).attr('type') ?? 'text'
      return type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'reset' && type !== 'image'
    })

    const unlabelledInputs: string[] = []
    for (const el of formInputs) {
      const id = $(el).attr('id')
      const ariaLabel = $(el).attr('aria-label')
      const ariaLabelledBy = $(el).attr('aria-labelledby')
      const title = $(el).attr('title')
      const placeholder = $(el).attr('placeholder') // acceptable comme fallback

      const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false
      const hasWrapLabel = $(el).closest('label').length > 0

      if (!hasLabel && !hasWrapLabel && !ariaLabel && !ariaLabelledBy && !title) {
        const tag = (el as any).tagName
        const inputId = id ?? placeholder ?? $(el).attr('name') ?? tag
        unlabelledInputs.push(inputId.slice(0, 60))
      }
    }

    // ── 2. Boutons sans texte accessible ────────────────────────────────────
    const emptyButtons: string[] = []
    $('button').each((_, el) => {
      const text = $(el).text().trim()
      const ariaLabel = $(el).attr('aria-label')
      const ariaLabelledBy = $(el).attr('aria-labelledby')
      const title = $(el).attr('title')
      // Bouton avec icône uniquement (pas de texte visible ni aria)
      if (!text && !ariaLabel && !ariaLabelledBy && !title) {
        const html = $(el).html()?.slice(0, 80) ?? '<button>'
        emptyButtons.push(html)
      }
    })

    // ── 3. Liens sans texte accessible (liens icônes vides) ─────────────────
    const emptyLinks: string[] = []
    $('a[href]').each((_, el) => {
      const text = $(el).text().trim()
      const ariaLabel = $(el).attr('aria-label')
      const ariaLabelledBy = $(el).attr('aria-labelledby')
      const title = $(el).attr('title')
      const imgAlt = $('img', el).attr('alt')
      if (!text && !ariaLabel && !ariaLabelledBy && !title && !imgAlt) {
        emptyLinks.push(($(el).attr('href') ?? '').slice(0, 80))
      }
    })

    // ── 4. tabindex > 0 (perturbe l'ordre de navigation clavier) ────────────
    const badTabindex = $('[tabindex]').toArray().filter((el) => {
      const val = parseInt($(el).attr('tabindex') ?? '0', 10)
      return val > 0
    }).length

    // ── 5. Attribut autocomplete sur les champs sensibles ───────────────────
    const missingAutocomplete: number = $('input[type="email"], input[type="tel"], input[name*="email"], input[name*="phone"]')
      .toArray()
      .filter((el) => !$(el).attr('autocomplete')).length

    // ── Score ────────────────────────────────────────────────────────────────
    const totalIssues = unlabelledInputs.length + emptyButtons.length + emptyLinks.length + badTabindex
    const recommendations: string[] = []

    if (unlabelledInputs.length > 0) {
      recommendations.push(
        `${unlabelledInputs.length} champ${unlabelledInputs.length > 1 ? 's' : ''} de formulaire sans label — les lecteurs d'écran ne peuvent pas les identifier. Associer chaque input à un <label for="..."> ou ajouter aria-label.`,
      )
    }
    if (emptyButtons.length > 0) {
      recommendations.push(
        `${emptyButtons.length} bouton${emptyButtons.length > 1 ? 's' : ''} sans texte accessible (icônes seules) — ajouter un aria-label descriptif pour les utilisateurs de lecteurs d'écran.`,
      )
    }
    if (emptyLinks.length > 0) {
      recommendations.push(
        `${emptyLinks.length} lien${emptyLinks.length > 1 ? 's' : ''} sans texte ni aria-label — un lien vide est inutilisable au clavier et incompréhensible pour les technologies d'assistance.`,
      )
    }
    if (badTabindex > 0) {
      recommendations.push(
        `${badTabindex} élément${badTabindex > 1 ? 's avec tabindex > 0' : ' avec tabindex > 0'} — cela perturbe l'ordre de navigation naturel au clavier. Utiliser tabindex="0" ou "-1" uniquement.`,
      )
    }
    if (missingAutocomplete > 0) {
      recommendations.push(
        `${missingAutocomplete} champ email/téléphone sans attribut autocomplete — ajouter autocomplete="email" ou "tel" améliore l'expérience mobile et la conformité WCAG 1.3.5.`,
      )
    }

    let score: number
    let status: 'good' | 'warning' | 'critical'

    if (totalIssues === 0)        { score = 100; status = 'good'     }
    else if (totalIssues <= 2)    { score = 75;  status = 'warning'  }
    else if (totalIssues <= 5)    { score = 50;  status = 'warning'  }
    else if (totalIssues <= 10)   { score = 25;  status = 'critical' }
    else                          { score = 5;   status = 'critical' }

    return {
      score,
      status,
      details: {
        unlabelledInputs: { count: unlabelledInputs.length, examples: unlabelledInputs.slice(0, 5) },
        emptyButtons: { count: emptyButtons.length },
        emptyLinks: { count: emptyLinks.length },
        badTabindex,
        missingAutocomplete,
        totalIssues,
      },
      recommendations: recommendations.length > 0 ? recommendations : ['Tous les éléments interactifs ont un texte accessible — bonne pratique WCAG 2.1.'],
      summary: totalIssues === 0
        ? 'Éléments interactifs accessibles'
        : [
            unlabelledInputs.length > 0 && `${unlabelledInputs.length} input${unlabelledInputs.length > 1 ? 's' : ''} sans label`,
            emptyButtons.length > 0 && `${emptyButtons.length} bouton${emptyButtons.length > 1 ? 's' : ''} vide${emptyButtons.length > 1 ? 's' : ''}`,
            emptyLinks.length > 0 && `${emptyLinks.length} lien${emptyLinks.length > 1 ? 's' : ''} vide${emptyLinks.length > 1 ? 's' : ''}`,
          ].filter(Boolean).join(' · '),
    }
  },
}
