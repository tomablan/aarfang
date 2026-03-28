import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const planEnum = pgEnum('plan', ['free', 'pro', 'agency'])
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer'])
export const cmsTypeEnum = pgEnum('cms_type', ['wordpress', 'prestashop', 'other'])
export const siteStatusEnum = pgEnum('site_status', ['active', 'paused', 'archived'])
export const monitorIntervalEnum = pgEnum('monitor_interval', ['daily', 'weekly', 'monthly'])
export const integrationProviderEnum = pgEnum('integration_provider', [
  'semrush', 'gsc', 'pagespeed', 'betterstack', 'wordpress', 'prestashop', 'claude', 'openai',
])
export const integrationStatusEnum = pgEnum('integration_status', ['active', 'invalid', 'revoked'])
export const auditStatusEnum = pgEnum('audit_status', ['pending', 'running', 'completed', 'failed'])
export const signalCategoryEnum = pgEnum('signal_category', [
  'technique', 'securite', 'conformite', 'seo_technique', 'seo_local', 'opportunites', 'sea', 'accessibilite',
])
export const signalStatusEnum = pgEnum('signal_status', ['good', 'warning', 'critical', 'skipped'])

// ─── Tables ───────────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  plan: planEnum('plan').notNull().default('free'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('organizations_slug_idx').on(t.slug),
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  role: userRoleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
  index('users_org_idx').on(t.orgId),
])

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  url: varchar('url', { length: 2048 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  cmsType: cmsTypeEnum('cms_type'),
  isEcommerce: boolean('is_ecommerce').notNull().default(false),
  status: siteStatusEnum('status').notNull().default('active'),
  aiSummary: text('ai_summary'),
  aiSummaryAt: timestamp('ai_summary_at'),
  aiRecommendations: text('ai_recommendations'),
  aiRecommendationsAt: timestamp('ai_recommendations_at'),
  techStack: jsonb('tech_stack').$type<{
    cms?: string; ecommerce?: string; framework?: string
    server?: string; cdn?: string; hosting?: string; language?: string
  }>(),
  techStackAt: timestamp('tech_stack_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('sites_org_idx').on(t.orgId),
])

export const monitors = pgTable('monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  interval: monitorIntervalEnum('interval').notNull().default('weekly'),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  alertOnDegradation: boolean('alert_on_degradation').notNull().default(true),
  degradationThreshold: integer('degradation_threshold').notNull().default(5),
  alertEmail: varchar('alert_email', { length: 255 }),
  alertWebhookUrl: varchar('alert_webhook_url', { length: 2048 }),
}, (t) => [
  uniqueIndex('monitors_site_idx').on(t.siteId),
])

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  provider: integrationProviderEnum('provider').notNull(),
  credentials: text('credentials').notNull(), // JSON chiffré AES-256-GCM
  status: integrationStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastTestedAt: timestamp('last_tested_at'),
}, (t) => [
  index('integrations_org_idx').on(t.orgId),
  index('integrations_site_idx').on(t.siteId),
])

export const siteMembers = pgTable('site_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('site_members_site_user_idx').on(t.siteId, t.userId),
  index('site_members_user_idx').on(t.userId),
])

export const audits = pgTable('audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
  status: auditStatusEnum('status').notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  scores: jsonb('scores').$type<{
    global: number
    technique: number
    securite: number
    conformite: number
    seo_technique: number
    seo_local: number
    opportunites: number
    sea: number
    accessibilite: number
  }>(),
  errorMessage: text('error_message'),
  crawlStatus: varchar('crawl_status', { length: 20 }), // null | 'pending' | 'running' | 'done' | 'skipped'
  crawlProgress: jsonb('crawl_progress').$type<{ crawled: number; discovered: number; currentUrl: string }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('audits_site_idx').on(t.siteId),
  index('audits_status_idx').on(t.status),
])

export const auditResults = pgTable('audit_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditId: uuid('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  signalId: varchar('signal_id', { length: 100 }).notNull(),
  category: signalCategoryEnum('category').notNull(),
  score: integer('score'), // null si skipped
  status: signalStatusEnum('status').notNull(),
  details: jsonb('details').notNull().default({}),
  recommendations: jsonb('recommendations').$type<string[]>().notNull().default([]),
}, (t) => [
  index('audit_results_audit_idx').on(t.auditId),
  index('audit_results_category_idx').on(t.category),
])

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  sites: many(sites),
  integrations: many(integrations),
}))

export const usersRelations = relations(users, ({ one }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
}))

export const sitesRelations = relations(sites, ({ one, many }) => ({
  org: one(organizations, { fields: [sites.orgId], references: [organizations.id] }),
  monitor: one(monitors, { fields: [sites.id], references: [monitors.siteId] }),
  audits: many(audits),
  integrations: many(integrations),
}))

export const auditsRelations = relations(audits, ({ one, many }) => ({
  site: one(sites, { fields: [audits.siteId], references: [sites.id] }),
  triggeredByUser: one(users, { fields: [audits.triggeredBy], references: [users.id] }),
  results: many(auditResults),
}))

export const auditResultsRelations = relations(auditResults, ({ one }) => ({
  audit: one(audits, { fields: [auditResults.auditId], references: [audits.id] }),
}))

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  events: jsonb('events').$type<string[]>().notNull().default(['audit.completed']),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  secret: varchar('secret', { length: 64 }),
  enabled: boolean('enabled').notNull().default(true),
  lastTriggeredAt: timestamp('last_triggered_at'),
  lastStatus: integer('last_status'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('webhooks_org_idx').on(t.orgId),
])
