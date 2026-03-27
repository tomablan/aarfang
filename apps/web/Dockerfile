# ── Build ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/signals/package.json ./packages/signals/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db/
COPY packages/signals ./packages/signals/
COPY apps/web ./apps/web/

# URL de l'API — vide par défaut (appels relatifs, valide si web et API sur le même domaine via proxy)
# Définir VITE_API_URL=https://api.yourdomain.com si l'API est sur un sous-domaine séparé
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/apps/web
RUN pnpm build

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=builder /app/apps/web/build ./build

ENV NODE_ENV=production
# PORT utilisé par SvelteKit adapter-node (défaut 3000)
ENV PORT=3000
# ORIGIN doit correspondre à l'URL publique du site (ex: https://app.yourdomain.com)
# Requis par SvelteKit pour la protection CSRF
ENV ORIGIN=http://localhost:3000

EXPOSE 3000
CMD ["node", "build/index.js"]
