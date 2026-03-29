import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __envDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__envDir, '../../../.env') })
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth.js'
import { sitesRoutes } from './routes/sites.js'
import { auditRoutes } from './routes/audits.js'
import { integrationsRoutes } from './routes/integrations.js'
import { monitorsRoutes } from './routes/monitors.js'
import { orgRoutes } from './routes/org.js'
import { oauthRoutes } from './routes/oauth.js'
import { webhooksRoutes } from './routes/webhooks.js'
import { superadminRoutes } from './routes/superadmin.js'
import { startAuditWorker } from './lib/queue.js'
import { env } from './env.js'

const app = new Hono()

app.use('*', logger())
const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173']

app.use('*', cors({
  origin: corsOrigins,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

app.get('/health', (c) => c.json({ ok: true, version: '0.1.0' }))

app.route('/api/auth', authRoutes)
app.route('/api/oauth', oauthRoutes)
app.route('/api/sites', sitesRoutes)
app.route('/api', auditRoutes)
app.route('/api', monitorsRoutes)
app.route('/api/integrations', integrationsRoutes)
app.route('/api/org', orgRoutes)
app.route('/api/webhooks', webhooksRoutes)
app.route('/api/superadmin', superadminRoutes)

serve({ fetch: app.fetch, port: env.API_PORT, hostname: env.API_HOST, maxRequestBodySize: 20 * 1024 * 1024 /* 20 MB */ }, (info) => {
  console.log(`🚀 API running on http://${info.address}:${info.port}`)
})

// Démarrer le worker BullMQ (traite les audits en queue et les crons)
startAuditWorker()
