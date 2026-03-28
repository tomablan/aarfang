#!/bin/bash
# deploy.sh — Mise à jour de l'application sur OVH VPS
# Usage : ./deploy.sh

set -euo pipefail

COMPOSE="docker compose -f docker-compose.ovh.yml --env-file .env"

# Vérifier que DB_PASSWORD ne contient pas de caractères qui cassent l'URL postgres
DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
if echo "$DB_PASS" | grep -qE '[/+=]'; then
  echo "⚠️  DB_PASSWORD contient des caractères invalides dans une URL (/ + =)."
  echo "   Regénère-le avec : openssl rand -hex 32"
  exit 1
fi

echo "📦 Pull du code..."
git pull origin main

echo "🔨 Build et redémarrage des conteneurs..."
$COMPOSE up -d --build --remove-orphans

echo "🧹 Suppression des images obsolètes..."
docker image prune -f

echo "✅ Déploiement terminé"
$COMPOSE ps
