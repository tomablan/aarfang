import type { Context, Next } from 'hono'
import { verifyToken } from '../lib/jwt.js'

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verifyToken(token)
    c.set('userId', payload.sub)
    c.set('orgId', payload.orgId)
    c.set('role', payload.role)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
