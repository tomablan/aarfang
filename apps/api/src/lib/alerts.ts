import nodemailer from 'nodemailer'
import { env } from '../env.js'
import type { AuditScores } from '@aarfang/signals'

export interface AlertPayload {
  site: { id: string; name: string; url: string }
  previousScore: number
  newScore: number
  drop: number
  threshold: number
  scores: AuditScores
  auditId: string
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export async function sendWebhookAlert(webhookUrl: string, payload: AlertPayload): Promise<void> {
  const body = {
    event: 'score_degradation',
    site: payload.site,
    previousScore: payload.previousScore,
    newScore: payload.newScore,
    drop: payload.drop,
    threshold: payload.threshold,
    scores: payload.scores,
    auditId: payload.auditId,
    auditUrl: `${env.APP_URL}/sites/${payload.site.id}`,
    timestamp: new Date().toISOString(),
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Aarfang-Alerts/1.0' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Webhook responded with ${res.status}`)
  console.log(`[alerts] Webhook sent to ${webhookUrl}`)
}

// ─── Email ────────────────────────────────────────────────────────────────────

function buildEmailHtml(p: AlertPayload): string {
  const auditUrl = `${env.APP_URL}/sites/${p.site.id}`
  const scoreRow = (label: string, val: number) =>
    `<tr><td style="padding:4px 8px;color:#64748b">${label}</td><td style="padding:4px 8px;font-weight:600;color:${val >= 80 ? '#22c55e' : val >= 50 ? '#f59e0b' : '#ef4444'}">${val}/100</td></tr>`

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Alerte aarfang</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e293b;padding:20px 24px">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0">aarfang</p>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0 0">Alerte de dégradation</p>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#334155;margin-bottom:16px">
        Le score de <strong>${p.site.name}</strong> a chuté de
        <strong style="color:#ef4444">−${p.drop} points</strong>
        (seuil configuré : ${p.threshold} points).
      </p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px">
        <tr style="background:#f1f5f9">
          <td style="padding:8px;font-weight:600;font-size:13px;color:#475569">Score global</td>
          <td style="padding:8px;font-size:24px;font-weight:700;color:${p.newScore >= 80 ? '#22c55e' : p.newScore >= 50 ? '#f59e0b' : '#ef4444'}">${p.newScore}</td>
          <td style="padding:8px;color:#94a3b8;font-size:13px">était ${p.previousScore}</td>
        </tr>
        ${scoreRow('Sécurité', p.scores.securite)}
        ${scoreRow('Technique', p.scores.technique)}
        ${scoreRow('SEO Technique', p.scores.seo_technique)}
        ${scoreRow('SEO Local', p.scores.seo_local)}
        ${scoreRow('Opportunités', p.scores.opportunites)}
      </table>
      <a href="${auditUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">
        Voir le rapport complet →
      </a>
      <p style="font-size:11px;color:#94a3b8;margin-top:20px">
        ${p.site.url} · <a href="${auditUrl}" style="color:#94a3b8">${auditUrl}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function sendEmailAlert(to: string, payload: AlertPayload): Promise<void> {
  if (!env.SMTP_HOST) {
    console.warn('[alerts] SMTP not configured — email alert skipped')
    return
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `⚠️ Score en baisse : ${payload.site.name} — ${payload.newScore}/100 (−${payload.drop} pts)`,
    html: buildEmailHtml(payload),
  })

  console.log(`[alerts] Email sent to ${to}`)
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function dispatchAlerts(
  monitor: { alertEmail: string | null; alertWebhookUrl: string | null },
  payload: AlertPayload
): Promise<void> {
  const tasks: Promise<void>[] = []

  if (monitor.alertEmail) {
    tasks.push(
      sendEmailAlert(monitor.alertEmail, payload).catch((err) =>
        console.error('[alerts] Email failed:', err.message)
      )
    )
  }

  if (monitor.alertWebhookUrl) {
    tasks.push(
      sendWebhookAlert(monitor.alertWebhookUrl, payload).catch((err) =>
        console.error('[alerts] Webhook failed:', err.message)
      )
    )
  }

  await Promise.all(tasks)
}
