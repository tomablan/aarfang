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

// DELETE /api/superadmin/orgs/:orgId — supprimer une organisation
app.delete('/orgs/:orgId', async (c) => {
  const { orgId } = c.req.param()
  const db = getDb()
  const [deleted] = await db.delete(organizations).where(eq(organizations.id, orgId)).returning()
  if (!deleted) return c.json({ error: 'Organization not found' }, 404)
  return c.json({ success: true })
})

export { app as superadminRoutes }
