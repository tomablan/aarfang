import tls from 'node:tls'
import { URL } from 'node:url'
import type { Signal, SignalResult, AuditContext } from '../types.js'

function getCertInfo(hostname: string): Promise<{ validTo: string; daysRemaining: number }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate()
      socket.destroy()
      if (!cert?.valid_to) return reject(new Error('No certificate found'))
      const validTo = new Date(cert.valid_to)
      const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
      resolve({ validTo: validTo.toISOString(), daysRemaining })
    })
    socket.on('error', reject)
    socket.setTimeout(8000, () => { socket.destroy(); reject(new Error('SSL check timeout')) })
  })
}

export const sslExpiry: Signal = {
  id: 'ssl_expiry',
  category: 'securite',
  weight: 3,
  async analyze(ctx: AuditContext): Promise<SignalResult> {
    // Erreur SSL lors du fetch de la page — certificat inaccessible ou invalide
    if (ctx.page.fetchErrorType === 'ssl_expired') {
      return {
        score: 0, status: 'critical',
        details: { fetchError: ctx.page.fetchError },
        recommendations: ['Renouveler le certificat SSL immédiatement — il est expiré et le site est inaccessible.'],
        summary: 'Certificat SSL expiré — le site est inaccessible',
      }
    }
    if (ctx.page.fetchErrorType === 'ssl_invalid') {
      return {
        score: 0, status: 'critical',
        details: { fetchError: ctx.page.fetchError },
        recommendations: ['Vérifier la configuration SSL du serveur — le certificat est invalide ou mal configuré.'],
        summary: 'Erreur SSL — certificat invalide ou mal configuré',
      }
    }
    if (!ctx.page.finalUrl.startsWith('https://')) {
      return { score: 0, status: 'skipped', details: { reason: 'HTTPS not enabled' }, recommendations: [] }
    }
    try {
      const { hostname } = new URL(ctx.page.finalUrl)
      const { validTo, daysRemaining } = await getCertInfo(hostname)

      const expiryFmt = new Date(validTo).toLocaleDateString('fr-FR')
      if (daysRemaining <= 0) {
        return { score: 0, status: 'critical', details: { validTo, daysRemaining }, recommendations: ['Renouveler le certificat SSL immédiatement — il est expiré.'], summary: `Certificat expiré depuis ${Math.abs(daysRemaining)} jours (${expiryFmt})` }
      }
      if (daysRemaining <= 14) {
        return { score: 20, status: 'critical', details: { validTo, daysRemaining }, recommendations: [`Renouveler le certificat SSL — expire dans ${daysRemaining} jours.`], summary: `Expire dans ${daysRemaining} jours — le ${expiryFmt}` }
      }
      if (daysRemaining <= 30) {
        return { score: 60, status: 'warning', details: { validTo, daysRemaining }, recommendations: [`Planifier le renouvellement SSL — expire dans ${daysRemaining} jours.`], summary: `Expire dans ${daysRemaining} jours — le ${expiryFmt}` }
      }
      return { score: 100, status: 'good', details: { validTo, daysRemaining }, recommendations: [], summary: `Valide jusqu'au ${expiryFmt} (${daysRemaining} jours)` }
    } catch (err) {
      return { score: 0, status: 'skipped', details: { error: String(err) }, recommendations: [] }
    }
  },
}
