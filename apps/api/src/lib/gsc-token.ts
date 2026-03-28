import { eq, and } from 'drizzle-orm'
import { getDb, integrations } from '@aarfang/db'
import { encrypt, decrypt } from './crypto.js'

interface GscCredentials {
  clientId: string
  clientSecret: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

/** Retourne un accessToken GSC valide — rafraîchit automatiquement si expiré */
export async function getValidGscToken(orgId: string): Promise<string | null> {
  const db = getDb()
  const [row] = await db.select()
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, 'gsc')))
    .limit(1)

  if (!row) return null

  let creds: GscCredentials
  try {
    creds = JSON.parse(decrypt(row.credentials)) as GscCredentials
  } catch {
    return null
  }

  // Pas encore connecté via OAuth (pas de refresh token)
  if (!creds.refreshToken || !creds.accessToken) return null

  // Token encore valide
  const needsRefresh = !creds.expiresAt || Date.now() > creds.expiresAt - 5 * 60 * 1000
  if (!needsRefresh) return creds.accessToken

  const refreshed = await refreshAccessToken(creds.clientId, creds.clientSecret, creds.refreshToken)
  if (!refreshed) {
    await db.update(integrations).set({ status: 'invalid' }).where(eq(integrations.id, row.id))
    return null
  }

  const newCreds: GscCredentials = {
    ...creds,
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + refreshed.expiresIn * 1000,
  }

  await db.update(integrations).set({
    credentials: encrypt(JSON.stringify(newCreds)),
    status: 'active',
    lastTestedAt: new Date(),
  }).where(eq(integrations.id, row.id))

  return newCreds.accessToken
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token: string; expires_in: number }
    return { accessToken: data.access_token, expiresIn: data.expires_in }
  } catch {
    return null
  }
}
