#!/usr/bin/env bash
# verify-cloud-run-env.sh — Verifica que las env vars críticas estén en Cloud Run
# Uso: ./scripts/verify-cloud-run-env.sh
# No contiene secrets — solo verifica existencia.

set -euo pipefail

SERVICE="steve-api"
REGION="us-central1"
PROJECT="steveapp-agency"

REQUIRED_VARS=(
  META_APP_ID
  META_APP_SECRET
  APIFY_TOKEN
  GEMINI_API_KEY
  SENTRY_DSN
  ANTHROPIC_API_KEY
  CRON_SECRET
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ENCRYPTION_KEY
)

echo "Verificando env vars en Cloud Run: ${SERVICE} (${REGION})..."

# Fetch current env vars from the service
CURRENT_VARS=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format='value(spec.template.spec.containers[0].env.name)' 2>/dev/null) || {
  echo "ERROR: No se pudo consultar el servicio. ¿Estás autenticado con gcloud?"
  exit 1
}

MISSING=()
PRESENT=()

for VAR in "${REQUIRED_VARS[@]}"; do
  if echo "$CURRENT_VARS" | grep -qw "$VAR"; then
    PRESENT+=("$VAR")
  else
    MISSING+=("$VAR")
  fi
done

echo ""
echo "=== RESULTADO ==="
echo "Presentes: ${#PRESENT[@]}/${#REQUIRED_VARS[@]}"

for v in "${PRESENT[@]}"; do
  echo "  ✓ $v"
done

if [ ${#MISSING[@]} -eq 0 ]; then
  echo ""
  echo "✅ Todas las variables críticas están configuradas."
  exit 0
fi

echo ""
echo "⚠️  FALTAN ${#MISSING[@]} variable(s):"
for v in "${MISSING[@]}"; do
  echo "  ✗ $v"
done

echo ""
echo "Para restaurarlas, corre:"
echo ""
echo "  gcloud run services update $SERVICE \\"
echo "    --region $REGION --project $PROJECT \\"
echo "    --set-env-vars $(IFS=,; echo "${MISSING[*]/%/=<valor>}")"
echo ""
echo "Los valores están en Secret Manager o en el historial de deploys."
exit 1
