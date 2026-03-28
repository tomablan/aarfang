#!/bin/bash
# deploy.sh — Mise à jour de l'application sur OVH VPS
# Usage : ./deploy.sh

set -euo pipefail

COMPOSE="docker compose -f docker-compose.ovh.yml --env-file .env"

echo "📦 Pull du code..."
git pull origin main

echo "🔨 Build et redémarrage des conteneurs..."
$COMPOSE up -d --build --remove-orphans

echo "🧹 Suppression des images obsolètes..."
docker image prune -f

echo "✅ Déploiement terminé"
$COMPOSE ps
