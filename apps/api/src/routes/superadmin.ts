import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq, desc, sql } from 'drizzle-orm'
import { getDb, users, organizations, sites, audits } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'
import { isSuperAdmin } from '../lib/access.js'
import { sendOrgInviteEmail } from '../lib/alerts.js'

const app = new Hono()
app.use('*', authMiddleware)

// Guard super_admin sur toutes les routes
app.use('*', async (c, next) => {
  if (!isSuperAdmin(c.get('role') as string)) {
    return c.json({ error: 'Forbidden — super_admin required' }, 403)
  }
  await next()
})

// GET /api/superadmin/orgs — toutes les organisations
app.get('/orgs', async (c) => {
  const db = getDb()
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      createdAt: organizations.createdAt,
      userCount: sql<number>`count(distinct ${users.id})::int`,
      siteCount: sql<number>`count(distinct ${sites.id})::int`,
    })
    .from(organizations)
    .leftJoin(users, eq(users.orgId, organizations.id))
    .leftJoin(sites, eq(sites.orgId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(desc(organizations.createdAt))

  return c.json(rows)
})

// GET /api/superadmin/users — tous les utilisateurs
app.get('/users', async (c) => {
  const db = getDb()
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      createdAt: users.createdAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgPlan: organizations.plan,
    })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .orderBy(desc(users.createdAt))

  return c.json(rows)
})

// POST /api/superadmin/invite-org — créer une nouvelle organisation avec un owner
app.post('/invite-org', async (c) => {
  const { orgName, ownerEmail, ownerFirstName, ownerLastName, plan = 'free' } = await c.req.json<{
    orgName: string
    ownerEmail: string
    ownerFirstName?: string
    ownerLastName?: string
    plan?: 'free' | 'pro' | 'agency'
  }>()

  if (!orgName || !ownerEmail) {
    return c.json({ error: 'orgName and ownerEmail are required' }, 400)
  }

  const db = getDb()

  // Vérifier que l'email n'existe pas déjà
  const [existing] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, ownerEmail.toLowerCase())).limit(1)
  if (existing) return c.json({ error: 'A user with this email already exists' }, 409)

  // Générer un slug unique depuis le nom d'org
  const baseSlug = orgName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60)

  let slug = baseSlug
  let attempt = 0
  while (true) {
    const [existing] = await db.select({ id: organizations.id }).from(organizations)
      .where(eq(organizations.slug, slug)).limit(1)
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  // Créer l'organisation
  const [org] = await db.insert(organizations).values({
    name: orgName.trim(),
    slug,
    plan: plan as 'free' | 'pro' | 'agency',
  }).returning()

  // Générer un mot de passe temporaire
  const tempPassword = Math.random().toString(36).slice(2, 10)
    + Math.random().toString(36).slice(2, 6).toUpperCase() + '!'

  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const [owner] = await db.insert(users).values({
    orgId: org.id,
    email: ownerEmail.toLowerCase(),
    passwordHash,
    firstName: ownerFirstName?.trim() ?? null,
    lastName: ownerLastName?.trim() ?? null,
    role: 'owner',
  }).returning({
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role,
  })

  // Envoyer l'email d'invitation (silencieux si SMTP non configuré)
  let emailSent = false
  try {
    await sendOrgInviteEmail(owner.email, { orgName: org.name, tempPassword })
    emailSent = true
  } catch (err) {
    console.error('[superadmin] Failed to send invite email:', err instanceof Error ? err.message : err)
  }

  return c.json({ org, owner, tempPassword, emailSent }, 201)
})

// POST /api/superadmin/test-email — envoyer un email de test
app.post('/test-email', async (c) => {
  const { to } = await c.req.json<{ to: string }>()
  if (!to) return c.json({ error: 'to is required' }, 400)

  const { env } = await import('../env.js')
  if (!env.SMTP_HOST) return c.json({ error: 'SMTP not configured (SMTP_HOST is empty)' }, 422)

  try {
    const nodemailer = (await import('nodemailer')).default
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: '✅ Test email — aarfang',
      html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Test email aarfang</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:32px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:#1e293b;padding:20px 24px">
      <p style="color:#fff;font-size:18px;font-weight:700;margin:0">aarfang</p>
      <p style="color:#94a3b8;font-size:13px;margin:4px 0 0">Test de configuration SMTP</p>
    </div>
    <div style="padding:28px 24px">
      <p style="font-size:15px;color:#334155;margin-bottom:16px">
        ✅ La configuration SMTP fonctionne correctement.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px">
        <tr><td style="padding:8px 12px;font-size:12px;color:#94a3b8">Hôte</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b">${env.SMTP_HOST}:${env.SMTP_PORT}</td></tr>
        <tr style="background:#f1f5f9"><td style="padding:8px 12px;font-size:12px;color:#94a3b8">Expéditeur</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b">${env.SMTP_FROM}</td></tr>
        <tr><td style="padding:8px 12px;font-size:12px;color:#94a3b8">Destinataire</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b">${to}</td></tr>
      </table>
      <p style="font-size:12px;color:#94a3b8;margin:0">Envoyé depuis la console super admin aarfang.</p>
    </div>
  </div>
</body>
</html>`,
    })
    console.log(`[superadmin] Test email sent to ${to}`)
    return c.json({ success: true, to, smtp: `${env.SMTP_HOST}:${env.SMTP_PORT}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[superadmin] Test email failed:', message)
    return c.json({ error: message }, 500)
  }
})

// DELETE /api/superadmin/orgs/:orgId — supprimer une organisation
app.delete('/orgs/:orgId', async (c) => {
  const { orgId } = c.req.param()
  const db = getDb()
  const [deleted] = await db.delete(organizations).where(eq(organizations.id, orgId)).returning()
  if (!deleted) return c.json({ error: 'Organization not found' }, 404)
  return c.json({ success: true })
})

export { app as superadminRoutes }
