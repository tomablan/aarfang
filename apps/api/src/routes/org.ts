import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
import { getDb, users, organizations } from '@aarfang/db'
import { authMiddleware } from '../middleware/auth.js'

const ROLE_RANK: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()
app.use('*', authMiddleware)

// GET /api/org/users — liste les membres de l'org
app.get('/users', async (c) => {
  const orgId = c.get('orgId') as string
  const db = getDb()
  const members = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(users.createdAt)
  return c.json(members)
})

// POST /api/org/users — inviter un membre (owner ou admin seulement)
app.post('/users', async (c) => {
  const orgId = c.get('orgId') as string
  const callerId = c.get('userId') as string
  const callerRole = c.get('role') as string

  if (!['owner', 'admin'].includes(callerRole)) {
    return c.json({ error: 'Forbidden — admin or owner required' }, 403)
  }

  const { email, role = 'member', firstName, lastName } = await c.req.json<{
    email: string
    role?: 'owner' | 'admin' | 'member' | 'viewer'
    firstName?: string
    lastName?: string
  }>()

  if (!email) return c.json({ error: 'email is required' }, 400)

  // Un admin ne peut pas créer un owner ou un autre admin
  if (callerRole === 'admin' && (ROLE_RANK[role] ?? 0) >= ROLE_RANK['admin']) {
    return c.json({ error: 'Forbidden — only owner can assign admin or owner role' }, 403)
  }

  const db = getDb()

  // Vérifier que l'email n'existe pas déjà
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  if (existing) return c.json({ error: 'A user with this email already exists' }, 409)

  // Générer un mot de passe temporaire
  const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + '!'
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  const [newUser] = await db.insert(users).values({
    orgId,
    email: email.toLowerCase(),
    passwordHash,
    firstName: firstName ?? null,
    lastName: lastName ?? null,
    role: role as 'owner' | 'admin' | 'member' | 'viewer',
  }).returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role, createdAt: users.createdAt })

  // Retourner le mot de passe temporaire une seule fois
  return c.json({ user: newUser, tempPassword }, 201)
})

// PUT /api/org/users/:userId — modifier le rôle d'un membre
app.put('/users/:userId', async (c) => {
  const orgId = c.get('orgId') as string
  const callerId = c.get('userId') as string
  const callerRole = c.get('role') as string
  const { userId } = c.req.param()

  if (!['owner', 'admin'].includes(callerRole)) {
    return c.json({ error: 'Forbidden — admin or owner required' }, 403)
  }

  const { role } = await c.req.json<{ role: 'admin' | 'member' | 'viewer' }>()
  if (!role) return c.json({ error: 'role is required' }, 400)

  if (callerRole === 'admin' && (ROLE_RANK[role] ?? 0) >= ROLE_RANK['admin']) {
    return c.json({ error: 'Forbidden — only owner can assign admin or owner role' }, 403)
  }

  const db = getDb()
  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, orgId))).limit(1)
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.id === callerId) return c.json({ error: 'Cannot change your own role' }, 400)
  if (target.role === 'owner' && callerRole !== 'owner') return c.json({ error: 'Forbidden — only owner can modify another owner' }, 403)

  const [updated] = await db.update(users).set({ role: role as 'admin' | 'member' | 'viewer' }).where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role, createdAt: users.createdAt })

  return c.json(updated)
})

// DELETE /api/org/users/:userId — supprimer un membre
app.delete('/users/:userId', async (c) => {
  const orgId = c.get('orgId') as string
  const callerId = c.get('userId') as string
  const callerRole = c.get('role') as string
  const { userId } = c.req.param()

  if (!['owner', 'admin'].includes(callerRole)) {
    return c.json({ error: 'Forbidden — admin or owner required' }, 403)
  }
  if (userId === callerId) return c.json({ error: 'Cannot remove yourself' }, 400)

  const db = getDb()
  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, orgId))).limit(1)
  if (!target) return c.json({ error: 'User not found' }, 404)

  // Un admin ne peut pas supprimer un owner ou un autre admin
  if (callerRole === 'admin' && (ROLE_RANK[target.role] ?? 0) >= ROLE_RANK['admin']) {
    return c.json({ error: 'Forbidden — only owner can remove an admin or owner' }, 403)
  }

  // Protéger le dernier owner
  if (target.role === 'owner') {
    const ownerCount = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, 'owner')))
    if (ownerCount.length <= 1) {
      return c.json({ error: 'Cannot remove the last owner of the organization' }, 400)
    }
  }

  await db.delete(users).where(eq(users.id, userId))
  return c.json({ success: true })
})

export { app as orgRoutes }
