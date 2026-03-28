export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://aarfang:aarfang@localhost:5432/aarfang',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev_secret_change_in_prod',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '0'.repeat(64), // 32 bytes hex
  API_PORT: Number(process.env.API_PORT ?? 3001),
  API_HOST: process.env.API_HOST ?? '0.0.0.0',
  // Email (optionnel — alertes de dégradation)
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? 'alerts@aarfang.io',
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
  // URL publique de l'API — utilisée pour les redirect URI OAuth
  API_URL: process.env.API_URL ?? 'http://localhost:3001',
  // Origines autorisées pour CORS — séparées par virgule en production
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? '',
}
