import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb, users, organizations } from '@aarfang/db'
import { signToken, verifyToken, signResetToken, verifyResetToken } from '../lib/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import { sendPasswordResetEmail } from '../lib/alerts.js'

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

// Mot de passe oublié — envoie un lien de réinitialisation par email
app.post('/forgot-password', async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }))
  const { email } = body
  if (!email) return c.json({ error: 'Email required' }, 400)

  const db = getDb()
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)

  // Toujours répondre OK pour ne pas révéler si l'email existe
  if (!user) return c.json({ ok: true })

  const token = await signResetToken(user.id)
  await sendPasswordResetEmail(user.email, token).catch(err =>
    console.error('[auth] Forgot password email failed:', err)
  )

  return c.json({ ok: true })
})

// Réinitialisation du mot de passe avec le token reçu par email
app.post('/reset-password', async (c) => {
  const resetBody = await c.req.json<{ token?: string; newPassword?: string }>().catch(() => ({ token: undefined, newPassword: undefined }))
  const { token, newPassword } = resetBody
  if (!token || !newPassword) return c.json({ error: 'token and newPassword are required' }, 400)
  if (newPassword.length < 8) return c.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, 400)

  try {
    const payload = await verifyResetToken(token)
    const db = getDb()
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.update(users).set({ passwordHash }).where(eq(users.id, payload.sub))
    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Lien invalide ou expiré' }, 400)
  }
})

export { app as authRoutes }
