# AGENT.md — aarfang

Plateforme SaaS d'audit qualité de sites internet. Permet aux équipes commerciales et clients
de visualiser un score de santé par site, découpé en catégories de signaux. Les audits peuvent
être déclenchés manuellement ou automatiquement via un runner planifié.

---

## Stack

| Couche | Technologie | Notes |
|---|---|---|
| Frontend | SvelteKit 2 + TypeScript | **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) |
| UI | Tailwind CSS v4 | Dark mode via `.dark` class (`@variant dark`) — pas de `darkMode: 'class'` en v4 |
| API | Node.js + Hono + TypeScript | Léger, performant |
| BDD | PostgreSQL + Drizzle ORM | Type-safe, migrations versionnées manuellement |
| Queue / Cron | BullMQ + Redis | Audits asynchrones, scheduling monitors |
| Crawl | Playwright | Rendu JS, métriques DOM |
| HTML parsing | Cheerio | Analyse DOM statique dans les signaux |
| Auth | bcryptjs + JWT | bcrypt cost 12, JWT 24h access + 7j refresh |
| Infra | Docker Compose + Coolify | Self-hosted sur VPS OVH |
| Monorepo | pnpm workspaces | |

---

## Git

- Branche principale : **`master`** (pas `main`)
- Commits : Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)

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
  slug: string UNIQUE
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
  role: enum('owner','admin','member','viewer','super_admin')
  firstName: string | null
  lastName: string | null
  createdAt: timestamp
}
```

### `sites`
```ts
{
  id: uuid PK
  orgId: uuid FK → organizations
  url: string
  name: string
  cmsType: enum('wordpress','prestashop','other') | null
  status: enum('active','paused','archived')
  isEcommerce: boolean
  aiSummary: string | null
  aiRecommendations: jsonb | null
  techStack: jsonb {            // détecté automatiquement à l'audit
    cms?: string
    hosting?: string
    country?: string            // détecté via cf-ipcountry ou TLD
    analytics?: string[]
    ...
  } | null
  createdAt: timestamp
}
```

### `monitors`
```ts
{
  id: uuid PK
  siteId: uuid FK → sites UNIQUE
  enabled: boolean
  interval: enum('daily','weekly','monthly')
  lastRunAt: timestamp | null
  nextRunAt: timestamp | null
  alertOnDegradation: boolean
  degradationThreshold: int
}
```

### `integrations`
```ts
{
  id: uuid PK
  orgId: uuid FK → organizations
  siteId: uuid FK → sites | null
  provider: enum('semrush','gsc','pagespeed','betterstack','wordpress','prestashop','openai','anthropic','gemini')
  credentials: string              // JSON chiffré AES-256-GCM
  status: enum('active','invalid','revoked')
  createdAt: timestamp
  lastTestedAt: timestamp | null
}
```

### `audits`
```ts
{
  id: uuid PK
  siteId: uuid FK → sites
  triggeredBy: uuid FK → users | null   // null = cron
  status: enum('pending','running','completed','failed')
  startedAt: timestamp | null
  completedAt: timestamp | null
  scores: jsonb {
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
  } | null
  errorMessage: string | null
}
```

### `audit_results`
```ts
{
  id: uuid PK
  auditId: uuid FK → audits
  signalId: string
  category: enum('technique','securite','conformite','seo_technique','seo_local','opportunites','sea','accessibilite','ecoconception')
  score: int | null
  status: enum('good','warning','critical','skipped')
  details: jsonb
  recommendations: jsonb   // string[]
}
```

---

## Architecture des Signaux

Chaque signal est un module TypeScript indépendant dans `packages/signals/src/signals/`.
Le runner les importe via `packages/signals/src/runner.ts`.

### Interface Signal

```ts
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

export interface Signal {
  id: string           // snake_case unique (ex: 'ssl_expiry')
  category: SignalCategory
  weight: number
  requiredIntegrations?: string[]
  analyze(ctx: AuditContext): Promise<SignalResult>
}

export interface SignalResult {
  score: number        // 0–100
  status: 'good' | 'warning' | 'critical' | 'skipped'
  details: Record<string, unknown>
  recommendations: string[]
}
```

### Calcul du score

```
score_catégorie = Σ(signal.score × signal.weight) / Σ(signal.weight)
score_global = moyenne pondérée des catégories
  (technique×1, securite×1.5, conformite×1, seo_technique×1,
   seo_local×0.8, opportunites×0.7, sea×0.8, accessibilite×0.9, ecoconception×1)
```

### Ajouter un signal

1. Créer `packages/signals/src/signals/<id>.ts` — exporter un objet `Signal`
2. Importer et ajouter à `ALL_SIGNALS` dans `packages/signals/src/runner.ts`
3. Ajouter le libellé dans `signalLabel()` dans `apps/web/src/lib/utils.ts`
4. Si nouvelle catégorie : voir section "Migrations DB" ci-dessous

### Signaux existants (55 signaux)

**Sécurité** : `https_enabled`, `ssl_expiry`, `security_headers`

**Conformité** : `cookie_consent`, `legal_pages`

**Technique** : `page_speed`, `server_response_time`, `viewport_meta`, `structured_data`,
`images_alt`, `open_graph`, `core_web_vitals`

**SEO Technique** : `meta_title`, `meta_description`, `h1_tag`, `canonical_tag`, `sitemap`,
`robots_txt`, `keyword_consistency`, `gsc_search_performance`, `gsc_keyword_opportunities`,
`crawl_duplicate_titles`, `crawl_broken_pages`, `crawl_redirects`, `crawl_thin_content`,
`crawl_depth`, `crawl_noindex`, `crawl_internal_linking`, `crawl_cannibalization`,
`crawl_meta_coverage`

**SEO Local** : `local_schema`, `review_schema`

**Opportunités** : `cta_presence`, `phone_visible`, `contact_form`, `social_presence`,
`trust_signals`, `live_chat`, `lead_capture`, `blog_presence`, `content_freshness`,
`video_presence`, `pricing_page`, `landing_page_detection`

**SEA & Tracking** : `analytics_setup`, `google_ads_tag`, `meta_pixel`, `sea_readiness`

**Accessibilité** : `accessibility_interactive`, `accessibility_structure`

**Éco-conception** : `eco_page_weight`, `eco_compression`, `eco_cache_policy`,
`eco_image_optimization`, `eco_third_party_scripts`, `eco_fonts`

---

## Migrations DB

Les migrations sont des fichiers SQL manuels (pas de `drizzle-kit push` en prod).

### Créer une migration

1. Créer `packages/db/drizzle/<idx>_<tag>.sql` (ex: `0013_foo_bar.sql`)
2. Ajouter l'entrée dans `packages/db/drizzle/meta/_journal.json` :
   ```json
   { "idx": 13, "version": "7", "when": 1774636000000, "tag": "0013_foo_bar", "breakpoints": true }
   ```
3. Appliquer en production via Docker :
   ```bash
   docker exec -i <postgres-container> psql -U <user> -d <db> < packages/db/drizzle/0013_foo_bar.sql
   ```

### Ajouter une valeur à un enum PostgreSQL

```sql
ALTER TYPE "public"."signal_category" ADD VALUE IF NOT EXISTS 'nouvelle_valeur';
```

**Important** : PostgreSQL ne permet pas `ALTER TYPE ... ADD VALUE` dans une transaction.
Appliquer seul dans une migration dédiée.

---

## API REST — Routes principales

```
# Auth
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
PUT    /api/auth/password          # Changer son mot de passe (authMiddleware requis)

# Sites
GET    /api/sites
POST   /api/sites
GET    /api/sites/:siteId
PUT    /api/sites/:siteId
DELETE /api/sites/:siteId

# Audits
POST   /api/sites/:siteId/audits
GET    /api/sites/:siteId/audits
GET    /api/sites/:siteId/audits/latest
GET    /api/audits/:auditId

# Monitor
GET    /api/sites/:siteId/monitor
PUT    /api/sites/:siteId/monitor

# Intégrations
GET    /api/integrations
POST   /api/integrations
DELETE /api/integrations/:id
POST   /api/integrations/:id/test

# Organisation & utilisateurs
GET    /api/org
PUT    /api/org
GET    /api/org/users
POST   /api/org/users/invite
DELETE /api/org/users/:userId

# Superadmin (role: super_admin uniquement)
GET    /api/superadmin/stats
GET    /api/superadmin/orgs
GET    /api/superadmin/users
POST   /api/superadmin/test-email   # Tester la configuration SMTP
```

---

## Routes SvelteKit (frontend)

```
/                               → redirect vers /dashboard
/login
/dashboard
/sites/new
/sites/[siteId]                 → tableau de bord du site + audit (sidebar catégories)
/sites/[siteId]/audits          → historique
/sites/[siteId]/fiche           → fiche technique (CMS, hosting, country, tech stack)
/sites/[siteId]/settings
/settings/org
/settings/integrations
/settings/users
/settings/profile               → infos compte + changement de mot de passe
/superadmin                     → interface super_admin (onglets: Stats, Orgs, Users, Système)
```

---

## Conventions Svelte 5

- **`$state`** pour toutes les variables réactives, y compris les refs DOM :
  ```ts
  let menuRef = $state<HTMLDivElement | undefined>()   // bind:this compatible
  ```
- **`{@const}`** doit être enfant direct d'un block Svelte (`{#if}`, `{#each}`, etc.)
  — pas dans un `<div>` ordinaire
- **`{:else if}`** ne peut pas suivre un `{:else}` dans Svelte — toujours mettre les
  `{:else if}` avant le `{:else}` final

---

## Dark Mode (Tailwind v4)

Tailwind v4 n'utilise pas `darkMode: 'class'` dans la config — la bascule se fait via `@variant dark` dans les classes CSS custom. Le mode sombre est activé en ajoutant la classe `.dark` sur `<html>`.

Dans les composants SvelteKit, utiliser les variantes `dark:` normalement :
```html
<div class="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
```

---

## Variables d'environnement

```bash
# apps/api/.env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=
ENCRYPTION_KEY=           # AES-256 pour credentials intégrations
API_PORT=3001
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# apps/web/.env
PUBLIC_API_URL=http://localhost:3001
```

---

## Commandes de développement

```bash
pnpm dev                  # Lance api + web en parallèle
pnpm build                # Build packages puis apps
pnpm db:migrate           # Applique les migrations Drizzle
pnpm db:seed              # Seed initial (org + user super_admin)
pnpm db:studio            # Drizzle Studio UI
```

Credentials seed par défaut : `hello@aarfang.com` / `admin1234` (role: `super_admin`)

---

## Docker Compose (production)

Services :
- `postgres` — PostgreSQL 16 (non exposé externellement)
- `redis` — Redis 7
- `api` — Hono API + workers BullMQ
- `web` — SvelteKit (node adapter)

Connexion PostgreSQL en production :
```bash
docker exec -it <postgres-container> psql -U <user> -d <db>
```

---

## Sécurité

- Passwords : bcrypt (cost 12)
- Sessions : JWT 24h access token + refresh token 7j
- Credentials intégrations : chiffrés AES-256-GCM
- Multi-tenant : `orgId` vérifié en middleware, jamais exposé au client
- Rate limiting sur les routes auth et déclenchement d'audit

---

## Conventions de code

- TypeScript strict (`strict: true`) partout
- camelCase variables/fonctions, PascalCase composants/types, snake_case BDD
- Chaque signal dans son propre fichier : `packages/signals/src/signals/<id>.ts`
- Les erreurs de signal ne font jamais planter l'audit : `try/catch` → `status: 'skipped'`
- Labels des signaux et catégories centralisés dans `apps/web/src/lib/utils.ts`
