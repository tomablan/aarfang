FROM node:22-alpine
RUN corepack enable

WORKDIR /app

# Copier les manifestes pour l'installation des dépendances en cache layer
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/signals/package.json ./packages/signals/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Copier les sources
COPY packages/db ./packages/db/
COPY packages/signals ./packages/signals/
COPY apps/api ./apps/api/

EXPOSE 3001

# Jouer les migrations puis démarrer le serveur
CMD ["sh", "-c", "cd /app/packages/db && node_modules/.bin/tsx src/migrate.ts && cd /app/apps/api && exec node_modules/.bin/tsx src/index.ts"]
