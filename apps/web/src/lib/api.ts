const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...init } = options
  // Ne pas forcer Content-Type pour FormData — le browser doit poser lui-même le boundary
  const headers: Record<string, string> = init.body instanceof FormData
    ? {}
    : { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? 'Unknown error')
  }
  return res.json() as Promise<T>
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<{ user: User; org: Org }>('/api/auth/me', { token }),
}

// Sites
export const sitesApi = {
  list: (token: string) => request<SiteWithAudit[]>('/api/sites', { token }),
  get: (token: string, id: string) => request<Site>(`/api/sites/${id}`, { token }),
  create: (token: string, data: { url: string; name: string; cmsType?: string }) =>
    request<Site>('/api/sites', { method: 'POST', token, body: JSON.stringify(data) }),
  update: (token: string, id: string, data: Partial<{ name: string; isEcommerce: boolean; cmsType: string }>) =>
    request<Site>(`/api/sites/${id}`, { method: 'PUT', token, body: JSON.stringify(data) }),
  delete: (token: string, id: string) =>
    request<{ success: boolean }>(`/api/sites/${id}`, { method: 'DELETE', token }),
  generateSummary: (token: string, id: string) =>
    request<{ summary: string; generatedAt: string }>(`/api/sites/${id}/summary`, { method: 'POST', token }),
}

// Audits
export const auditsApi = {
  trigger: (token: string, siteId: string, crawlFile?: File) => {
    if (crawlFile) {
      const formData = new FormData()
      formData.append('crawlFile', crawlFile)
      return request<{ auditId: string; status: string; crawlUrls?: number }>(
        `/api/sites/${siteId}/audits`,
        { method: 'POST', token, body: formData }
      )
    }
    return request<{ auditId: string; status: string; crawlUrls?: number }>(`/api/sites/${siteId}/audits`, { method: 'POST', token })
  },
  get: (token: string, auditId: string) => request<Audit>(`/api/audits/${auditId}`, { token }),
  latest: (token: string, siteId: string) => request<AuditWithResults | null>(`/api/sites/${siteId}/audits/latest`, { token }),
  history: (token: string, siteId: string) => request<Audit[]>(`/api/sites/${siteId}/audits`, { token }),
}

// Intégrations
export const integrationsApi = {
  list: (token: string) => request<Integration[]>('/api/integrations', { token }),
  create: (token: string, data: { provider: string; credentials: Record<string, string>; siteId?: string }) =>
    request<Integration>('/api/integrations', { method: 'POST', token, body: JSON.stringify(data) }),
  delete: (token: string, id: string) =>
    request<{ success: boolean }>(`/api/integrations/${id}`, { method: 'DELETE', token }),
  test: (token: string, id: string) =>
    request<{ ok: boolean; error?: string }>(`/api/integrations/${id}/test`, { method: 'POST', token }),
}

// Site members
export const siteMembersApi = {
  list: (token: string, siteId: string) =>
    request<SiteMember[]>(`/api/sites/${siteId}/members`, { token }),
  add: (token: string, siteId: string, userId: string) =>
    request<{ success: boolean }>(`/api/sites/${siteId}/members`, { method: 'POST', token, body: JSON.stringify({ userId }) }),
  remove: (token: string, siteId: string, userId: string) =>
    request<{ success: boolean }>(`/api/sites/${siteId}/members/${userId}`, { method: 'DELETE', token }),
}

// Org / Users
export const orgApi = {
  listUsers: (token: string) => request<OrgMember[]>('/api/org/users', { token }),
  inviteUser: (token: string, data: { email: string; role?: string; firstName?: string; lastName?: string }) =>
    request<{ user: OrgMember; tempPassword: string }>('/api/org/users', { method: 'POST', token, body: JSON.stringify(data) }),
  updateRole: (token: string, userId: string, role: string) =>
    request<OrgMember>(`/api/org/users/${userId}`, { method: 'PUT', token, body: JSON.stringify({ role }) }),
  removeUser: (token: string, userId: string) =>
    request<{ success: boolean }>(`/api/org/users/${userId}`, { method: 'DELETE', token }),
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User { id: string; email: string; firstName: string | null; lastName: string | null; role: string; orgId: string }
export interface Org { name: string; slug: string; plan: string }
export interface Site { id: string; orgId: string; url: string; name: string; cmsType: string | null; isEcommerce: boolean; status: string; aiSummary: string | null; aiSummaryAt: string | null; createdAt: string }
export interface SiteWithAudit extends Site { latestAudit: Audit | null }
export interface AuditScores { global: number; technique: number; securite: number; seo_technique: number; seo_local: number; opportunites: number }
export interface Audit { id: string; siteId: string; status: string; scores: AuditScores | null; startedAt: string | null; completedAt: string | null; createdAt: string; errorMessage: string | null }
export interface AuditResult { id: string; signalId: string; category: string; score: number | null; status: string; details: Record<string, unknown>; recommendations: string[] }
export interface AuditWithResults extends Audit { results: AuditResult[] }
export interface Integration { id: string; orgId: string; siteId: string | null; provider: string; status: string; createdAt: string; lastTestedAt: string | null }
export interface OrgMember { id: string; email: string; firstName: string | null; lastName: string | null; role: string; createdAt: string }
export interface SiteMember { id: string; email: string; firstName: string | null; lastName: string | null; role: string; grantedAt: string }
