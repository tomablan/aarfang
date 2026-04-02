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
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/api/auth/password', { method: 'PUT', token, body: JSON.stringify({ currentPassword, newPassword }) }),
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
  bulk: (token: string, sites: Array<{ url: string; name: string; cmsType?: string; isEcommerce?: boolean }>) =>
    request<{ results: Array<{ index: number; status: 'created' | 'error'; site?: { id: string; name: string; url: string }; error?: string }> }>(
      '/api/sites/bulk', { method: 'POST', token, body: JSON.stringify({ sites }) }
    ),
  generateSummary: (token: string, id: string) =>
    request<{ summary: string; generatedAt: string }>(`/api/sites/${id}/summary`, { method: 'POST', token }),
  generateRecommendations: (token: string, id: string) =>
    request<{ recommendations: string; generatedAt: string }>(`/api/sites/${id}/recommendations`, { method: 'POST', token }),
}

// Audits
export const auditsApi = {
  trigger: (token: string, siteId: string, opts?: { crawlMode: 'none' | 'auto' | 'file'; crawlFile?: File | null; crawlOptions?: Record<string, unknown> }) => {
    const formData = new FormData()
    const mode = opts?.crawlMode ?? 'none'
    formData.append('crawlMode', mode)
    if (mode === 'file' && opts?.crawlFile) {
      formData.append('crawlFile', opts.crawlFile)
    }
    if (mode === 'auto' && opts?.crawlOptions) {
      formData.append('crawlOptions', JSON.stringify(opts.crawlOptions))
    }
    return request<{ auditId: string; status: string; crawlMode: string; crawlUrls?: number }>(
      `/api/sites/${siteId}/audits`,
      { method: 'POST', token, body: formData }
    )
  },
  get: (token: string, auditId: string) => request<Audit>(`/api/audits/${auditId}`, { token }),
  latest: (token: string, siteId: string) => request<AuditWithResults | null>(`/api/sites/${siteId}/audits/latest`, { token }),
  history: (token: string, siteId: string) => request<Audit[]>(`/api/sites/${siteId}/audits`, { token }),
  pages: (token: string, auditId: string) => request<CrawlPage[]>(`/api/audits/${auditId}/pages`, { token }),
}

export interface CrawlPage {
  id: string
  auditId: string
  url: string
  statusCode: number
  title: string | null
  indexable: boolean
  crawlDepth: number
  inlinks: number
  wordCount: number | null
  contentType: string | null
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

// Super admin
export const superadminApi = {
  listOrgs: (token: string) => request<SuperAdminOrg[]>('/api/superadmin/orgs', { token }),
  listUsers: (token: string) => request<SuperAdminUser[]>('/api/superadmin/users', { token }),
  inviteOrg: (token: string, data: { orgName: string; ownerEmail: string; ownerFirstName?: string; ownerLastName?: string; plan?: string }) =>
    request<{ org: { id: string; name: string; slug: string }; owner: { email: string }; tempPassword: string; emailSent: boolean }>(
      '/api/superadmin/invite-org', { method: 'POST', token, body: JSON.stringify(data) }
    ),
  deleteOrg: (token: string, orgId: string) =>
    request<{ success: boolean }>(`/api/superadmin/orgs/${orgId}`, { method: 'DELETE', token }),
  testEmail: (token: string, to: string) =>
    request<{ success: boolean; to: string; smtp: string }>('/api/superadmin/test-email', { method: 'POST', token, body: JSON.stringify({ to }) }),
}

// Page audits (deep scoring)
export const pageAuditsApi = {
  trigger: (token: string, siteId: string, url: string) =>
    request<{ id: string; status: string }>(`/api/sites/${siteId}/page-audits`, {
      method: 'POST', token, body: JSON.stringify({ url }),
    }),
  get: (token: string, id: string) => request<PageAudit>(`/api/page-audits/${id}`, { token }),
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User { id: string; email: string; firstName: string | null; lastName: string | null; role: string; orgId: string }
export interface Org { name: string; slug: string; plan: string }
export interface TechStack { cms?: string; ecommerce?: string; framework?: string; server?: string; cdn?: string; hosting?: string; language?: string; country?: string }
export interface Site { id: string; orgId: string; url: string; name: string; cmsType: string | null; isEcommerce: boolean; status: string; aiSummary: string | null; aiSummaryAt: string | null; aiRecommendations: string | null; aiRecommendationsAt: string | null; techStack: TechStack | null; techStackAt: string | null; createdAt: string }
export interface SiteWithAudit extends Site { latestAudit: Audit | null }
export interface AuditScores { global: number; technique: number; securite: number; conformite: number; seo_technique: number; seo_local: number; opportunites: number; sea: number; accessibilite: number; ecoconception: number }
export interface CrawlProgress { crawled: number; discovered: number; currentUrl: string }
export interface Audit { id: string; siteId: string; status: string; scores: AuditScores | null; startedAt: string | null; completedAt: string | null; createdAt: string; errorMessage: string | null; crawlStatus: string | null; crawlProgress: CrawlProgress | null }
export interface AuditResult { id: string; signalId: string; category: string; score: number | null; status: string; details: Record<string, unknown>; recommendations: string[] }
export interface AuditWithResults extends Audit { results: AuditResult[] }
export interface Integration { id: string; orgId: string; siteId: string | null; provider: string; status: string; createdAt: string; lastTestedAt: string | null; oauthConnected?: boolean }
export interface OrgMember { id: string; email: string; firstName: string | null; lastName: string | null; role: string; createdAt: string }
export interface SiteMember { id: string; email: string; firstName: string | null; lastName: string | null; role: string; grantedAt: string }
export interface SuperAdminOrg { id: string; name: string; slug: string; plan: string; createdAt: string; userCount: number; siteCount: number }
export interface SuperAdminUser { id: string; email: string; firstName: string | null; lastName: string | null; role: string; createdAt: string; orgId: string; orgName: string; orgPlan: string }
export interface PageAuditResult { signalId: string; category: string; score: number | null; status: string; details: Record<string, unknown>; recommendations: string[] }
export interface PageAudit { id: string; siteId: string; url: string; status: string; scores: AuditScores | null; results: PageAuditResult[] | null; errorMessage: string | null; createdAt: string; completedAt: string | null }
