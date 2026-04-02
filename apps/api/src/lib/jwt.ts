import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env.js'

const secret = new TextEncoder().encode(env.JWT_SECRET)

export interface JwtPayload {
  sub: string   // userId
  orgId: string
  role: string
}

export interface ResetTokenPayload {
  sub: string
  type: 'password_reset'
}

export async function signResetToken(userId: string) {
  return new SignJWT({ sub: userId, type: 'password_reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret)
}

export async function verifyResetToken(token: string): Promise<ResetTokenPayload> {
  const { payload } = await jwtVerify(token, secret)
  if (payload['type'] !== 'password_reset') throw new Error('Invalid token type')
  return payload as unknown as ResetTokenPayload
}

export async function signToken(payload: JwtPayload, expiresIn = '15m') {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JwtPayload
}
