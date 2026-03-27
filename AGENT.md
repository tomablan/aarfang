# AGENT.md — aarfang

Plateforme SaaS d'audit qualité de sites internet. Permet aux équipes commerciales et clients
de visualiser un score de santé par site, découpé en catégories de signaux (Technique, Sécurité,
SEO Technique, SEO Local, Opportunités). Les audits peuvent être déclenchés manuellement ou
automatiquement via un runner planifié.

---

## Stack

| Couche | Technologie | Notes |
|---|---|---|
| Frontend | SvelteKit + TypeScript | SSR, i18n natif |
| UI | shadcn-svelte + Tailwind CSS | Composants accessibles |
| API | Node.js + Hono + TypeScript | Léger, performant |
| BDD | PostgreSQL + Drizzle ORM | Type-safe, migrations versionnées |
| Queue / Cron | BullMQ + Redis | Audits asynchrones, scheduling monitors |
| Crawl | Playwright | Rendu JS, screenshots, métriques DOM |
| Infra | Docker Compose | Self-hosted ; portable vers Railway/Fly/VPS |
| Monorepo | pnpm workspaces | |

---

## Structure du monorepo

```
aarfang/
├── apps/
│   ├── web/                  # SvelteKit — interface utilisateur
│   └── api/                  # Hono — API REST + workers BullMQ
├── packages/
│   ├── db/                   # Drizzle schema, migrations, client partagé
│   ├── signals/              # Modules de signaux (cœur extensible)
│   ├── integrations/         # Connecteurs tiers (Semrush, GSC, etc.)
│   └── shared/               # Types TypeScript partagés, utilitaires
├── plugins/
│   ├── wordpress/            # Plugin WP PHP — expose métriques via REST
│   └── prestashop/           # Module PS PHP — expose métriques via REST
├── docker-compose.yml
├── docker-compose.prod.yml
└── AGENT.md
```

---

## Modèle de données

### `organizations`
Tenant racine. Toutes les données sont isolées par organisation.

```ts
{
  id: uuid PK
  name: string
  slug: string UNIQUE         // utilisé dans les URLs
  plan: enum('free','pro','agency')
  createdAt: timestamp
}
```

### `users`
```ts
{
  id: uuid PK
  orgId: uuid FK → organizations
  email: string UNIQUE
  passwordHash: string
  role: enum('owner','admin','member','viewer')
  createdAt: timestamp
}
```

### `sites`
Un site = un domaine auditable appartenant à une organisation.

```ts
{
  id: uuid PK
  orgId: uuid FK → organizations
  url: string                 // URL canonique (ex: https://example.com)
  name: string                // Nom d'affichage
  cmsType: enum('wordpress','prestashop','other') | null
  status: enum('active','paused','archived')
  createdAt: timestamp
}
```

### `monitors`
Configuration du runner automatique par site.

```ts
{
  id: uuid PK
  siteId: uuid FK → sites UNIQUE
  enabled: boolean
  interval: enum('daily','weekly','monthly')
  lastRunAt: timestamp | null
  nextRunAt: timestamp | null
  alertOnDegradation: boolean
  degradationThreshold: int   // points de score en dessous duquel alerter
}
```

### `integrations`
Clés API et credentials tiers, chiffrés au repos (AES-256).
Peut être au niveau de l'organisation ou d'un site spécifique.

```ts
{
  id: uuid PK
  orgId: uuid FK → organizations
  siteId: uuid FK → sites | null   // null = intégration org-level
  provider: enum('semrush','gsc','pagespeed','betterstack','wordpress','prestashop')
  credentials: string              // JSON chiffré (clé API, tokens OAuth, etc.)
  status: enum('active','invalid','revoked')
  createdAt: timestamp
  lastTestedAt: timestamp | null
}
```

### `audits`
Snapshot daté de l'état d'un site. Immuable une fois completed.

```ts
{
  id: uuid PK
  siteId: uuid FK → sites
  triggeredBy: uuid FK → users | null   // null = cron
  status: enum('pending','running','completed','failed')
  startedAt: timestamp | null
  completedAt: timestamp | null
  scores: jsonb {                        // scores agrégés pour accès rapide
    global: number                       // 0–100
    technique: number
    securite: number
    seo_technique: number
    seo_local: number
    opportunites: number
  } | null
  errorMessage: string | null
}
```

### `audit_results`
Un enregistrement par signal analysé, dans un audit.

```ts
{
  id: uuid PK
  auditId: uuid FK → audits
  signalId: string              // identifiant du signal (ex: 'ssl_expiry')
  category: enum(...)           // dénormalisé pour requêtes filtrées
  score: int | null             // null si status = 'skipped'
  status: enum('good','warning','critical','skipped')
  details: jsonb                // données brutes spécifiques au signal
  recommendations: jsonb        // string[] — actions recommandées (i18n keys)
}
```

---

## Architecture des Signaux

Chaque signal est un module TypeScript indépendant dans `packages/signals/src/signals/`.
Le runner les importe automatiquement via un index barrel.

### Interface Signal

```ts
// packages/signals/src/types.ts

export type SignalCategory =
  | 'technique'
  | 'securite'
  | 'seo_technique'
  | 'seo_local'
  | 'opportunites'

export type SignalStatus = 'good' | 'warning' | 'critical' | 'skipped'

export interface AuditContext {
  site: Site
  html: string                          // HTML brut de la page principale
  headers: Record<string, string>       // Headers HTTP de la réponse
  playwright: {
    page: Page                          // Instance Playwright connectée
    metrics: PlaywrightMetrics          // CWV, timings
  }
  integrations: IntegrationClient       // Clients instanciés pour les intégrations disponibles
}

export interface SignalResult {
  score: number                         // 0–100
  status: SignalStatus
  details: Record<string, unknown>      // données brutes libres
  recommendations: string[]             // clés i18n (ex: 'signals.ssl_expiry.rec.renew')
}

export interface Signal {
  id: string                            // snake_case unique (ex: 'ssl_expiry')
  category: SignalCategory
  weight: number                        // poids relatif dans la catégorie (ex: 1–5)
  requiredIntegrations?: string[]       // si vide = signal natif sans dépendance externe
  analyze(ctx: AuditContext): Promise<SignalResult>
}
```

### Calcul du score

```
score_catégorie = Σ(signal.score × signal.weight) / Σ(signal.weight)
                  (signaux skipped exclus du calcul)

score_global = moyenne pondérée des scores par catégorie
               (poids par défaut : technique×1, securite×1.5, seo_technique×1,
                seo_local×0.8, opportunites×0.7)
```

### Signaux initiaux prévus

**Technique**
- `page_speed_score` — Score Lighthouse performance (PageSpeed API)
- `core_web_vitals` — LCP, FID, CLS (PageSpeed API)
- `mobile_friendly` — Test responsive (PageSpeed API)
- `ttfb` — Time To First Byte (Playwright)
- `broken_links` — Liens internes cassés (Playwright crawler)
- `redirects_chain` — Chaînes de redirections excessives

**Sécurité**
- `https_enabled` — HTTPS actif
- `ssl_expiry` — Validité du certificat SSL
- `security_headers` — CSP, HSTS, X-Frame-Options, X-Content-Type (headers HTTP)
- `mixed_content` — Ressources HTTP sur page HTTPS (Playwright)
- `cms_version` — Version CMS exposée / vulnérable (plugin WP/PS)

**SEO Technique**
- `meta_title` — Présence, longueur, unicité
- `meta_description` — Présence, longueur
- `h1_tag` — Présence et unicité du H1
- `sitemap` — Présence et validité de sitemap.xml
- `robots_txt` — Présence et cohérence de robots.txt
- `canonical_tag` — Canonical correctement défini
- `structured_data` — JSON-LD présent et valide
- `gsc_errors` — Erreurs d'indexation (Google Search Console)
- `keyword_visibility` — Visibilité sur mots-clés cibles (Semrush)

**SEO Local**
- `local_schema` — Schema.org LocalBusiness présent et complet
- `nap_consistency` — Cohérence Nom / Adresse / Téléphone
- `google_business_profile` — Fiche GBP connectée (GSC)

**Opportunités / Lead Gen**
- `cta_presence` — Call-to-action visible above the fold
- `phone_visible` — Numéro de téléphone accessible
- `contact_form` — Formulaire de contact présent
- `live_chat` — Chat en direct détecté
- `missing_landing_pages` — Pages de destination manquantes (Semrush)
- `uptime_score` — Disponibilité mesurée (BetterStack)

---

## Architecture des Intégrations

Chaque connecteur est un module dans `packages/integrations/src/`.

```ts
// packages/integrations/src/types.ts

export interface IntegrationConnector {
  provider: string
  test(credentials: Record<string, string>): Promise<{ ok: boolean; error?: string }>
  getClient(credentials: Record<string, string>): unknown  // client typé par connecteur
}
```

| Connecteur | Fichier | Données fournies |
|---|---|---|
| PageSpeed Insights | `pagespeed.ts` | CWV, Lighthouse scores, mobile |
| Google Search Console | `gsc.ts` | Impressions, clics, erreurs crawl, indexation |
| Semrush | `semrush.ts` | Mots-clés, backlinks, visibilité, pages manquantes |
| BetterStack | `betterstack.ts` | Uptime, incidents, temps de réponse |
| WordPress | `wordpress.ts` | Pull via REST API exposée par le plugin aarfang-wp |
| PrestaShop | `prestashop.ts` | Pull via REST API exposée par le module aarfang-ps |

Les credentials sont chiffrés en base. Si un connecteur requis par un signal n'est pas
configuré pour le site, le signal est retourné avec `status: 'skipped'` (pas de pénalité).

---

## API REST — Routes principales

```
# Auth
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me

# Sites
GET    /api/sites                        # Liste des sites de l'org
POST   /api/sites                        # Créer un site
GET    /api/sites/:siteId               # Détail + dernier score
PUT    /api/sites/:siteId
DELETE /api/sites/:siteId

# Audits
POST   /api/sites/:siteId/audits        # Déclencher un audit manuel
GET    /api/sites/:siteId/audits        # Historique des audits
GET    /api/sites/:siteId/audits/latest # Dernier audit avec résultats complets
GET    /api/audits/:auditId             # Audit complet avec tous les résultats signaux

# Monitor
GET    /api/sites/:siteId/monitor
PUT    /api/sites/:siteId/monitor

# Intégrations
GET    /api/integrations
POST   /api/integrations
DELETE /api/integrations/:id
POST   /api/integrations/:id/test       # Tester la connexion

# Signaux (registre)
GET    /api/signals                     # Liste de tous les signaux disponibles

# Organisation & utilisateurs
GET    /api/org
PUT    /api/org
GET    /api/org/users
POST   /api/org/users/invite
DELETE /api/org/users/:userId
```

Toutes les routes sont protégées par JWT. Le `orgId` est extrait du token — jamais passé
en paramètre client (isolation multi-tenant garantie côté serveur).

---

## Routes SvelteKit (frontend)

```
/                               → redirect vers /dashboard
/login
/dashboard                      → liste des sites avec score résumé
/sites/new
/sites/[siteId]                 → tableau de bord du site (écran principal)
/sites/[siteId]/audits          → historique des audits
/sites/[siteId]/audits/[id]     → détail d'un audit
/sites/[siteId]/settings        → config site + intégrations spécifiques
/settings/org                   → paramètres de l'organisation
/settings/integrations          → gestion des clés API org-level
/settings/users                 → gestion des membres
```

### Composants principaux

```
ScoreGauge          — jauge circulaire 0–100 avec couleur selon seuil
CategoryCard        — carte résumé d'une catégorie (score + top 3 alertes)
SignalRow           — ligne de détail d'un signal (score, status, recommandations)
AuditTimeline       — historique graphique des scores dans le temps
IntegrationBadge    — état d'une intégration (active / non configurée / erreur)
TriggerAuditButton  — déclencher un audit + polling du statut en temps réel
```

---

## i18n

Bibliothèque : `paraglide-js` (SvelteKit natif, compile-time, zero-runtime).

```
apps/web/src/lib/i18n/
  ├── messages/
  │   ├── fr.json      # Langue par défaut
  │   └── en.json
  └── index.ts
```

Les clés des recommandations de signaux (`signals.ssl_expiry.rec.renew`) sont stockées
en base et résolues côté frontend.

---

## Sécurité

- Passwords : bcrypt (cost 12)
- Sessions : JWT access token (15min) + refresh token httpOnly cookie (7j)
- Credentials intégrations : chiffrés AES-256-GCM, clé dans variable d'environnement
- Multi-tenant : `orgId` systématiquement vérifié en middleware API, jamais exposé au client
- Headers de sécurité : Helmet.js sur l'API, CSP sur SvelteKit
- Rate limiting : sur les routes auth et déclenchement d'audit

---

## Variables d'environnement

```bash
# apps/api/.env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=
ENCRYPTION_KEY=                  # AES-256 pour credentials intégrations
API_PORT=3001

# apps/web/.env
PUBLIC_API_URL=http://localhost:3001
```

---

## Docker Compose (self-hosted)

Services :
- `postgres` — PostgreSQL 16
- `redis` — Redis 7
- `api` — Hono API + workers BullMQ
- `web` — SvelteKit (node adapter)

Le fichier `docker-compose.prod.yml` surcharge pour la production (volumes persistants,
restart policies, variables via secrets).

---

## Phases de développement

### Phase 1 — Fondations (core)
- [ ] Init monorepo pnpm + workspaces
- [ ] Package `db` : schema Drizzle + migrations + client
- [ ] App `api` : Hono, middleware auth JWT, middleware org, structure routes
- [ ] App `web` : SvelteKit, layout auth, i18n paraglide, shadcn-svelte
- [ ] CRUD Sites
- [ ] Docker Compose avec postgres + redis

### Phase 2 — Runner d'audit
- [ ] Package `signals` : interface Signal + runner (collecte + calcul score)
- [ ] Intégration Playwright dans le runner
- [ ] Job BullMQ pour audit asynchrone
- [ ] Endpoint déclenchement + polling statut
- [ ] Implémentation des 10 premiers signaux natifs (sans intégration externe)

### Phase 3 — Dashboard
- [ ] Page `/sites/[siteId]` : ScoreGauge + CategoryCards
- [ ] Page détail audit : SignalRow par catégorie
- [ ] AuditTimeline (historique des scores)
- [ ] TriggerAuditButton avec statut temps réel (SSE ou polling)

### Phase 4 — Intégrations externes
- [ ] Package `integrations` : interface ConnectorI
- [ ] Connecteur PageSpeed Insights (gratuit, priorité 1)
- [ ] Connecteur Google Search Console
- [ ] Connecteur Semrush
- [ ] Connecteur BetterStack
- [ ] UI gestion des intégrations + test de connexion

### Phase 5 — Monitor / Cron
- [ ] Table monitors + CRUD
- [ ] Scheduler BullMQ (repeatable jobs)
- [ ] Alertes sur dégradation (email ou webhook)
- [ ] UI configuration du monitor par site

### Phase 6 — Plugins CMS
- [ ] Plugin WordPress (PHP) : endpoints REST métriques aarfang
- [ ] Module PrestaShop (PHP) : endpoints REST métriques aarfang
- [ ] Connecteur `wordpress.ts` + `prestashop.ts`
- [ ] Signaux CMS : version, plugins vulnérables, performances back-office

### Phase 7 — IA & recommandations
- [ ] Microservice Python/FastAPI optionnel
- [ ] Résumé textuel d'audit généré par LLM
- [ ] Recommandations priorisées et contextualisées
- [ ] Score prédictif (tendance)

---

## Conventions de code

- TypeScript strict (`strict: true`) partout
- Nommage : camelCase variables/fonctions, PascalCase composants/types, snake_case BDD
- Chaque signal dans son propre fichier : `packages/signals/src/signals/<id>.ts`
- Chaque connecteur dans son propre fichier : `packages/integrations/src/connectors/<provider>.ts`
- Les erreurs de signal ne font jamais planter l'audit : `try/catch` → `status: 'skipped'`
- Tests : Vitest pour les signaux et utilitaires, Playwright pour les e2e
- Commits : Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
