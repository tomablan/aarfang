import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env.js'

const secret = new TextEncoder().encode(env.JWT_SECRET)

export interface JwtPayload {
  sub: string   // userId
  orgId: string
  role: string
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
