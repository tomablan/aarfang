import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { getDb, sites, audits } from '@aarfang/db'
import { eq } from 'drizzle-orm'
import { env } from '../env.js'
import { runAudit } from '../workers/audit.worker.js'

export interface AuditJobData {
  siteId: string
  triggeredBy: string | null
}

let connection: IORedis | null = null
let auditQueue: Queue<AuditJobData> | null = null
let auditWorker: Worker<AuditJobData> | null = null

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
    connection.on('error', (err) => console.error('[redis] Connection error:', err.message))
  }
  return connection
}

export function getAuditQueue(): Queue<AuditJobData> {
  if (!auditQueue) {
    auditQueue = new Queue<AuditJobData>('audits', { connection: getConnection() })
  }
  return auditQueue
}

export function startAuditWorker() {
  if (auditWorker) return

  auditWorker = new Worker<AuditJobData>(
    'audits',
    async (job: Job<AuditJobData>) => {
      const { siteId, triggeredBy } = job.data
      const db = getDb()

      const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
      if (!site) {
        console.warn(`[worker] Site ${siteId} not found, skipping job ${job.id}`)
        return
      }

      // Créer l'enregistrement d'audit
      const [audit] = await db.insert(audits).values({
        siteId,
        triggeredBy: triggeredBy ?? null,
        status: 'pending',
      }).returning()

      await runAudit(audit.id, site)
    },
    { connection: getConnection(), concurrency: 3 }
  )

  auditWorker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed (site: ${job.data.siteId})`)
  })
  auditWorker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message)
  })

  console.log('[worker] Audit worker started')
}

// ─── Scheduler helpers ────────────────────────────────────────────────────────

const CRON_BY_INTERVAL: Record<string, string> = {
  daily: '0 6 * * *',
  weekly: '0 6 * * 1',
  monthly: '0 6 1 * *',
}

export async function scheduleMonitor(siteId: string, interval: 'daily' | 'weekly' | 'monthly') {
  const queue = getAuditQueue()
  const jobId = `monitor:${siteId}`
  const pattern = CRON_BY_INTERVAL[interval]

  // Supprimer l'ancienne planification si elle existe
  await queue.removeRepeatable(jobId, { pattern, jobId })

  await queue.add(
    'scheduled-audit',
    { siteId, triggeredBy: null },
    { repeat: { pattern }, jobId }
  )
  console.log(`[scheduler] Monitor scheduled for site ${siteId} (${interval} — ${pattern})`)
}

export async function unscheduleMonitor(siteId: string) {
  const queue = getAuditQueue()
  for (const pattern of Object.values(CRON_BY_INTERVAL)) {
    await queue.removeRepeatable(`monitor:${siteId}`, { pattern, jobId: `monitor:${siteId}` }).catch(() => {})
  }
  console.log(`[scheduler] Monitor removed for site ${siteId}`)
}

export async function getScheduledJobs(): Promise<{ siteId: string; pattern: string; next: number }[]> {
  const queue = getAuditQueue()
  const repeatables = await queue.getRepeatableJobs()
  return repeatables.map((r) => ({
    siteId: r.id?.replace('monitor:', '') ?? '',
    pattern: r.pattern ?? '',
    next: r.next,
  }))
}
