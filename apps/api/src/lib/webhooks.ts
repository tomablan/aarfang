import { createHmac } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { getDb, webhooks } from '@aarfang/db'
import { env } from '../env.js'
import type { AuditScores } from '@aarfang/signals'

export type WebhookEvent = 'audit.completed' | 'score.degraded'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

/** Calcule la signature HMAC-SHA256 du body JSON. */
function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

/** Envoie un payload à une URL de webhook avec signature optionnelle. */
async function deliver(webhook: { id: string; url: string; secret: string | null }, payload: WebhookPayload): Promise<number> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Aarfang-Webhooks/1.0',
    'X-Aarfang-Event': payload.event,
    'X-Aarfang-Delivery': webhook.id + '-' + Date.now(),
  }
  if (webhook.secret) {
    headers['X-Aarfang-Signature'] = sign(body, webhook.secret)
  }

  const res = await fetch(webhook.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  })
  return res.status
}

/** Déclenche tous les webhooks actifs d'une org correspondant à l'événement. */
export async function dispatchWebhooks(
  orgId: string,
  event: WebhookEvent,
  siteId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  const db = getDb()
  const rows = await db.select().from(webhooks)
    .where(and(eq(webhooks.orgId, orgId), eq(webhooks.enabled, true)))

  const matching = rows.filter((w) => {
    const events = w.events as string[]
    if (!events.includes(event)) return false
    // Si webhook lié à un site spécifique, filtrer
    if (w.siteId && siteId && w.siteId !== siteId) return false
    return true
  })

  if (matching.length === 0) return

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: { ...data, appUrl: env.APP_URL },
  }

  await Promise.all(
    matching.map(async (w) => {
      try {
        const status = await deliver(w, payload)
        await db.update(webhooks).set({ lastTriggeredAt: new Date(), lastStatus: status }).where(eq(webhooks.id, w.id))
        console.log(`[webhooks] ${event} → ${w.url} (${status})`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await db.update(webhooks).set({ lastTriggeredAt: new Date(), lastStatus: 0 }).where(eq(webhooks.id, w.id))
        console.error(`[webhooks] Failed ${w.url}: ${msg}`)
      }
    })
  )
}

/** Payload structuré pour audit.completed */
export function auditCompletedPayload(
  site: { id: string; name: string; url: string },
  auditId: string,
  scores: AuditScores,
) {
  return {
    site,
    auditId,
    scores,
    reportUrl: `${env.APP_URL}/sites/${site.id}`,
  }
}

/** Payload structuré pour score.degraded */
export function scoreDegradedPayload(
  site: { id: string; name: string; url: string },
  auditId: string,
  previousScore: number,
  newScore: number,
  drop: number,
  scores: AuditScores,
) {
  return {
    site,
    auditId,
    previousScore,
    newScore,
    drop,
    scores,
    reportUrl: `${env.APP_URL}/sites/${site.id}`,
  }
}
