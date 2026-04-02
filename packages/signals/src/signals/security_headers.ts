import type { Signal, SignalResult, AuditContext } from '../types.js'

interface HeaderCheck { header: string; label: string; weight: number }

const REQUIRED_HEADERS: HeaderCheck[] = [
  { header: 'strict-transport-security', label: 'HSTS', weight: 3 },
  { header: 'x-content-type-options', label: 'X-Content-Type-Options', weight: 2 },
  { header: 'content-security-policy', label: 'Content-Security-Policy', weight: 2 },
  { header: 'referrer-policy', label: 'Referrer-Policy', weight: 1 },
  { header: 'permissions-policy', label: 'Permissions-Policy', weight: 1 },
]

export const securityHeaders: Signal = {
  id: 'security_headers',
  category: 'securite',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    const present: string[] = []
    const missing: string[] = []
    let totalWeight = 0
    let earnedWeight = 0

    for (const check of REQUIRED_HEADERS) {
      totalWeight += check.weight
      if (ctx.page.headers[check.header]) {
        present.push(check.label)
        earnedWeight += check.weight
      } else {
        missing.push(check.label)
      }
    }

    // CSP frame-ancestors remplace X-Frame-Options (obsolète)
    totalWeight += 2
    const csp = ctx.page.headers['content-security-policy'] ?? ''
    if (csp.includes('frame-ancestors')) {
      present.push('CSP frame-ancestors')
      earnedWeight += 2
    } else {
      missing.push('CSP frame-ancestors')
    }

    const score = Math.round((earnedWeight / totalWeight) * 100)
    const status = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical'
    const recommendations = missing.map((h) =>
      h === 'CSP frame-ancestors'
        ? "Ajouter la directive frame-ancestors à votre Content-Security-Policy (remplace X-Frame-Options, ex: frame-ancestors 'self')"
        : `Ajouter l'en-tête de sécurité : ${h}`
    )
    const summary = missing.length === 0
      ? `Tous les en-têtes présents : ${present.join(', ')}`
      : `Absents : ${missing.join(', ')} · Présents : ${present.join(', ')}`

    return { score, status, details: { present, missing }, recommendations, summary }
  },
}
