import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb, users, organizations } from '@aarfang/db'
import { signToken, verifyToken } from '../lib/jwt.js'
import { authMiddleware } from '../middleware/auth.js'

type Vars = { Variables: { orgId: string; userId: string; role: string } }
const app = new Hono<Vars>()

app.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const accessToken = await signToken({ sub: user.id, orgId: user.orgId, role: user.role }, '24h')
  const refreshToken = await signToken({ sub: user.id, orgId: user.orgId, role: user.role }, '7d')

  return c.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      orgId: user.orgId,
    },
  })
})

app.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>()
  if (!refreshToken) return c.json({ error: 'Refresh token required' }, 400)
  try {
    const payload = await verifyToken(refreshToken)
    const accessToken = await signToken({ sub: payload.sub, orgId: payload.orgId, role: payload.role }, '24h')
    return c.json({ accessToken })
  } catch {
    return c.json({ error: 'Invalid refresh token' }, 401)
  }
})

app.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const payload = await verifyToken(authHeader.slice(7))
    const db = getDb()
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      orgId: users.orgId,
    }).from(users).where(eq(users.id, payload.sub)).limit(1)
    if (!user) return c.json({ error: 'User not found' }, 404)

    const [org] = await db.select({ name: organizations.name, slug: organizations.slug, plan: organizations.plan })
      .from(organizations).where(eq(organizations.id, user.orgId)).limit(1)

    return c.json({ user, org })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

app.put('/password', authMiddleware, async (c) => {
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>()
  if (!currentPassword || !newPassword) return c.json({ error: 'currentPassword and newPassword are required' }, 400)
  if (newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400)

  const userId = c.get('userId') as string
  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'User not found' }, 404)

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) return c.json({ error: 'Mot de passe actuel incorrect' }, 401)

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))

  return c.json({ success: true })
})

export { app as authRoutes }
