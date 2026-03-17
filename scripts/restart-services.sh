#!/bin/bash
# restart-services.sh — Restart Cloud Run or Supabase Edge Functions
# Called by OJOS health-check when 2+ consecutive failures are detected.
# Usage:
#   ./restart-services.sh cloud-run          # Restart Cloud Run steve-api
#   ./restart-services.sh edge-function NAME # Restart a specific Edge Function
#   ./restart-services.sh auto ENDPOINT      # Auto-detect service type and restart

set -euo pipefail

source ~/google-cloud-sdk/path.bash.inc 2>/dev/null || true

PROJECT="steveapp-agency"
REGION="us-central1"
SERVICE="steve-api"
SUPABASE_REF="zpswjccsxjtnhetkkqde"
LOG_FILE="/tmp/restart-services.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

restart_cloud_run() {
  log "Restarting Cloud Run service: $SERVICE"
  gcloud run services update "$SERVICE" \
    --region "$REGION" \
    --project "$PROJECT" \
    --update-env-vars "FORCE_RESTART=$(date +%s)" \
    --quiet 2>&1 | tee -a "$LOG_FILE"
  log "Cloud Run restart complete"
}

restart_edge_function() {
  local func_name="$1"
  log "Redeploying Supabase Edge Function: $func_name"
  cd ~/steve
  npx supabase functions deploy "$func_name" --project-ref "$SUPABASE_REF" 2>&1 | tee -a "$LOG_FILE"
  log "Edge Function $func_name redeployed"
}

# Map endpoint names to service types
auto_restart() {
  local endpoint="$1"
  case "$endpoint" in
    frontend)
      log "Frontend (Vercel) — cannot auto-restart, skipping"
      ;;
    cloud-run-root)
      restart_cloud_run
      ;;
    steve-chat|fetch-shopify-*|sync-shopify-*|sync-meta-*|check-meta-*|klaviyo-*|sync-klaviyo-*|steve-email-*)
      restart_cloud_run
      ;;
    *)
      log "Unknown endpoint: $endpoint — attempting Cloud Run restart"
      restart_cloud_run
      ;;
  esac
}

case "${1:-help}" in
  cloud-run)
    restart_cloud_run
    ;;
  edge-function)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 edge-function <function-name>"
      exit 1
    fi
    restart_edge_function "$2"
    ;;
  auto)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 auto <endpoint-name>"
      exit 1
    fi
    auto_restart "$2"
    ;;
  help|*)
    echo "Usage: $0 {cloud-run|edge-function <name>|auto <endpoint>}"
    exit 0
    ;;
esac
