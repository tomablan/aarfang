export type SignalCategory =
  | 'technique'
  | 'securite'
  | 'conformite'
  | 'seo_technique'
  | 'seo_local'
  | 'opportunites'
  | 'sea'
  | 'accessibilite'
  | 'ecoconception'

export type SignalStatus = 'good' | 'warning' | 'critical' | 'skipped'

export interface FetchedPage {
  html: string
  headers: Record<string, string>
  statusCode: number
  finalUrl: string
  responseTimeMs: number
}

// Credentials décryptés pour chaque provider — vides si non configurés
export interface IntegrationCredentials {
  pagespeed?: { apiKey: string }
  semrush?: { apiKey: string }
  gsc?: { accessToken: string; refreshToken?: string; expiresAt?: number }
  betterstack?: { apiToken: string }
  wordpress?: { url: string; applicationPassword: string }
  prestashop?: { url: string; apiKey: string }
}

/** Une ligne de crawl issue de l'export CSV Screaming Frog (Internal HTML) */
export interface CrawlRow {
  url: string
  statusCode: number
  contentType: string
  indexable: boolean
  title: string
  titleLength: number
  metaDescription: string
  metaDescriptionLength: number
  h1: string
  h1Count: number
  canonical: string
  metaRobots: string
  wordCount: number
  crawlDepth: number
  inlinks: number
}

export interface CrawlData {
  rows: CrawlRow[]
  totalUrls: number
  source: 'screaming_frog' | 'builtin'
}

export interface AuditContext {
  site: {
    id: string
    url: string
    name: string
    cmsType: string | null
    isEcommerce: boolean
  }
  page: FetchedPage
  integrations: IntegrationCredentials
  /** Données de crawl Screaming Frog — présentes uniquement si le CSV a été fourni */
  crawl?: CrawlData
}

export interface SignalResult {
  score: number
  status: SignalStatus
  details: Record<string, unknown>
  recommendations: string[]
  /** Explication technique concise — affichée dans l'UI sous le nom du signal */
  summary?: string
}

export interface Signal {
  id: string
  category: SignalCategory
  weight: number
  requiredIntegrations?: string[]
  analyze(ctx: AuditContext): Promise<SignalResult>
}

export interface AuditSignalResult extends SignalResult {
  signalId: string
  category: SignalCategory
}

export interface AuditScores {
  global: number
  technique: number
  securite: number
  conformite: number
  seo_technique: number
  seo_local: number
  opportunites: number
  sea: number
  accessibilite: number
  ecoconception: number
}
