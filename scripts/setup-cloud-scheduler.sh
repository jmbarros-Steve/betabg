#!/bin/bash
# =============================================================================
# Setup ALL Cloud Scheduler jobs for Steve Platform
# Replaces OpenClaw — all crons via Google Cloud Scheduler
#
# Usage:
#   export CRON_SECRET="your-secret-here"
#   bash scripts/setup-cloud-scheduler.sh
# =============================================================================

set -e

PROJECT="steveapp-agency"
REGION="us-central1"
API_URL="https://steve-api-850416724643.us-central1.run.app"

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: export CRON_SECRET first"
  echo "  Get it from: gcloud run services describe steve-api --region=$REGION --project=$PROJECT --format='value(spec.template.spec.containers[0].env)' | grep CRON_SECRET"
  exit 1
fi

create_job() {
  local name="$1"
  local schedule="$2"
  local endpoint="$3"
  local tz="${4:-UTC}"

  echo "Creating: $name ($schedule $tz) → $endpoint"

  # Delete if exists (idempotent)
  gcloud scheduler jobs delete "$name" \
    --location="$REGION" --project="$PROJECT" --quiet 2>/dev/null || true

  gcloud scheduler jobs create http "$name" \
    --location="$REGION" \
    --project="$PROJECT" \
    --schedule="$schedule" \
    --time-zone="$tz" \
    --uri="${API_URL}${endpoint}" \
    --http-method=POST \
    --headers="X-Cron-Secret=${CRON_SECRET},Content-Type=application/json" \
    --attempt-deadline=600s \
    --quiet
}

echo "============================================"
echo "  Steve Platform — Cloud Scheduler Setup"
echo "  Project: $PROJECT"
echo "  Region: $REGION"
echo "============================================"
echo ""

# ── CORE METRICS ──────────────────────────────────────────────
create_job "sync-all-metrics-6h" \
  "0 */6 * * *" \
  "/api/cron/sync-all-metrics"

# ── MONITORING & QA ──────────────────────────────────────────
create_job "changelog-watcher-daily" \
  "0 7 * * *" \
  "/api/cron/changelog-watcher"

create_job "error-budget-4h" \
  "0 */4 * * *" \
  "/api/cron/error-budget-calculator"

create_job "reconciliation-6h" \
  "0 */6 * * *" \
  "/api/cron/reconciliation"

create_job "detective-visual-2h" \
  "0 8,10,12,14,16,18,20 * * *" \
  "/api/cron/detective-visual" \
  "America/Santiago"

# ── META ADS & PERFORMANCE ───────────────────────────────────
create_job "performance-tracker-meta-8am" \
  "0 8 * * *" \
  "/api/cron/performance-tracker-meta" \
  "America/Santiago"

create_job "execute-meta-rules-9am" \
  "0 9 * * *" \
  "/api/cron/execute-meta-rules" \
  "America/Santiago"

create_job "performance-evaluator-10am" \
  "0 10 * * *" \
  "/api/cron/performance-evaluator" \
  "America/Santiago"

create_job "fatigue-detector-11am" \
  "0 11 * * *" \
  "/api/cron/fatigue-detector" \
  "America/Santiago"

create_job "competitor-spy-weekly" \
  "0 6 * * 1" \
  "/api/cron/competitor-spy" \
  "America/Santiago"

# ── STEVE BRAIN — HIGH FREQUENCY ─────────────────────────────
create_job "steve-content-hunter-20min" \
  "*/20 * * * *" \
  "/api/cron/steve-content-hunter"

create_job "steve-agent-loop-2h" \
  "0 */2 * * *" \
  "/api/cron/steve-agent-loop"

create_job "predictive-alerts-6h" \
  "0 */6 * * *" \
  "/api/cron/predictive-alerts"

# ── STEVE BRAIN — DAILY ──────────────────────────────────────
create_job "auto-brief-generator-7am" \
  "0 7 * * *" \
  "/api/cron/auto-brief-generator" \
  "America/Santiago"

create_job "anomaly-detector-10pm" \
  "0 22 * * *" \
  "/api/cron/anomaly-detector" \
  "America/Santiago"

# ── STEVE BRAIN — WEEKLY ─────────────────────────────────────
create_job "steve-discoverer-sun-2am" \
  "0 2 * * 0" \
  "/api/cron/steve-discoverer"

create_job "root-cause-analysis-sun-2am" \
  "0 2 * * 0" \
  "/api/cron/root-cause-analysis" \
  "America/Santiago"

create_job "rule-calibrator-sun-3am" \
  "0 3 * * 0" \
  "/api/cron/rule-calibrator"

create_job "steve-prompt-evolver-sun-3am" \
  "0 3 * * 0" \
  "/api/cron/steve-prompt-evolver"

create_job "revenue-attribution-sun-4am" \
  "0 4 * * 0" \
  "/api/cron/revenue-attribution"

create_job "knowledge-quality-score-sun-5am" \
  "0 5 * * 0" \
  "/api/cron/knowledge-quality-score"

create_job "weekly-report-monday-8am" \
  "0 11 * * 1" \
  "/api/cron/weekly-report"

create_job "funnel-diagnosis-monday-5am" \
  "0 5 * * 1" \
  "/api/cron/funnel-diagnosis"

# ── STEVE BRAIN — MONTHLY ────────────────────────────────────
create_job "cross-client-learning-monthly" \
  "0 3 1 * *" \
  "/api/cron/cross-client-learning"

create_job "knowledge-decay-monthly" \
  "0 4 1 * *" \
  "/api/cron/knowledge-decay"

create_job "knowledge-consolidator-monthly" \
  "0 5 1 * *" \
  "/api/cron/knowledge-consolidator"

create_job "knowledge-dedup-monthly" \
  "0 6 1 * *" \
  "/api/cron/knowledge-dedup"

# ── PROSPECTS & SALES ────────────────────────────────────────
create_job "prospect-followup-4h" \
  "0 */4 * * *" \
  "/api/cron/prospect-followup"

create_job "prospect-email-nurture-10am" \
  "0 13 * * *" \
  "/api/cron/prospect-email-nurture"

create_job "onboarding-wa-4h" \
  "0 */4 * * *" \
  "/api/cron/onboarding-wa"

create_job "merchant-upsell-sunday" \
  "0 11 * * 0" \
  "/api/cron/merchant-upsell"

create_job "churn-detector-daily" \
  "0 14 * * *" \
  "/api/cron/churn-detector"

create_job "abandoned-cart-wa-hourly" \
  "0 * * * *" \
  "/api/cron/abandoned-cart-wa"

# ── TASK MANAGEMENT ──────────────────────────────────────────
create_job "task-prioritizer-hourly" \
  "0 */1 * * *" \
  "/api/cron/task-prioritizer"

create_job "skyvern-dispatcher-2min" \
  "*/2 * * * *" \
  "/api/cron/skyvern-dispatcher"

# ── STEVE DEPREDADOR ─────────────────────────────────────────
create_job "wolf-night-mode-3am" \
  "0 3 * * *" \
  "/api/cron/wolf-night-mode" \
  "America/Santiago"

create_job "wolf-morning-send-9am" \
  "0 9 * * *" \
  "/api/cron/wolf-morning-send" \
  "America/Santiago"

create_job "sales-learning-loop-8pm" \
  "0 20 * * *" \
  "/api/cron/sales-learning-loop" \
  "America/Santiago"

# ── WA ACTION QUEUE ─────────────────────────────────────────
create_job "wa-action-processor-1min" \
  "* * * * *" \
  "/api/cron/wa-action-processor"

echo ""
echo "============================================"
echo "  DONE — All Cloud Scheduler jobs created"
echo "  Total: $(gcloud scheduler jobs list --location=$REGION --project=$PROJECT --format='value(name)' | wc -l | tr -d ' ') jobs"
echo "============================================"
echo ""
echo "To verify: gcloud scheduler jobs list --location=$REGION --project=$PROJECT"
echo "To test one: gcloud scheduler jobs run steve-content-hunter-20min --location=$REGION --project=$PROJECT"
