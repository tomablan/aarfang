import { load } from 'cheerio'
import type { Signal, SignalResult, AuditContext } from '../types.js'

export const contactForm: Signal = {
  id: 'contact_form',
  category: 'opportunites',
  weight: 2,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const $ = load(ctx.page.html)
    const forms = $('form')
    const formCount = forms.length

    if (formCount === 0) {
      return {
        score: 10, status: 'critical',
        details: { formCount: 0 },
        recommendations: ['Aucun formulaire détecté. Ajouter un formulaire de contact ou de demande de devis pour faciliter la conversion.'],
        summary: 'Aucun formulaire détecté',
      }
    }

    // Chercher un formulaire avec un champ email ou message
    let hasContactForm = false
    let hasEmailField = false

    forms.each((_, form) => {
      const inputs = $(form).find('input, textarea')
      inputs.each((_, input) => {
        const type = $(input).attr('type')?.toLowerCase()
        const name = $(input).attr('name')?.toLowerCase() ?? ''
        const placeholder = $(input).attr('placeholder')?.toLowerCase() ?? ''
        if (type === 'email' || name.includes('email') || name.includes('mail') || placeholder.includes('email')) {
          hasEmailField = true
          hasContactForm = true
        }
        if (name.includes('message') || name.includes('contact') || $(input).is('textarea')) {
          hasContactForm = true
        }
      })
    })

    if (hasEmailField) {
      return {
        score: 100, status: 'good',
        details: { formCount, hasEmailField: true },
        recommendations: [],
        summary: `${formCount} formulaire(s) avec champ email`,
      }
    }
    if (hasContactForm) {
      return {
        score: 70, status: 'warning',
        details: { formCount, hasEmailField: false },
        recommendations: ['Formulaire détecté mais sans champ email identifiable. Vérifier que le formulaire de contact est complet.'],
        summary: `${formCount} formulaire(s) sans champ email identifiable`,
      }
    }
    return {
      score: 40, status: 'warning',
      details: { formCount, hasEmailField: false },
      recommendations: [`${formCount} formulaire(s) détecté(s) mais aucun ne ressemble à un formulaire de contact. Ajouter un formulaire dédié.`],
      summary: `${formCount} formulaire(s) sans structure de contact`,
    }
  },
}
