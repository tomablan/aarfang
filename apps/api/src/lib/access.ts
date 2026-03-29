import { eq, and } from 'drizzle-orm'
import type { Db } from '@aarfang/db'
import { siteMembers, sites } from '@aarfang/db'

export function isSuperAdmin(role: string) {
  return role === 'super_admin'
}

/** owner et admin voient tous les sites de l'org — member et viewer uniquement les leurs */
export function isPrivileged(role: string) {
  return role === 'owner' || role === 'admin' || isSuperAdmin(role)
}

/** Vérifie qu'un utilisateur a accès à un site donné */
export async function canAccessSite(
  db: Db,
  siteId: string,
  orgId: string,
  userId: string,
  role: string,
): Promise<boolean> {
  // super_admin : accès universel
  if (isSuperAdmin(role)) return true

  // owner/admin : accès à tous les sites de l'org (vérification orgId uniquement)
  if (isPrivileged(role)) {
    const [site] = await db.select({ id: sites.id }).from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId))).limit(1)
    return !!site
  }
  // member/viewer : doit être dans site_members ET le site doit appartenir à l'org
  const [row] = await db
    .select({ id: siteMembers.id })
    .from(siteMembers)
    .innerJoin(sites, eq(siteMembers.siteId, sites.id))
    .where(and(
      eq(siteMembers.siteId, siteId),
      eq(siteMembers.userId, userId),
      eq(sites.orgId, orgId),
    ))
    .limit(1)
  return !!row
}
