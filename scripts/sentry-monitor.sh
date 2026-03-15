#!/bin/bash
# Sentry Monitor — polls Sentry API for new issues and alerts via WhatsApp
# Runs every 5 minutes via cron
# Requires: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT env vars

cd ~/steve

SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}"
SENTRY_ORG="${SENTRY_ORG:-}"
SENTRY_PROJECT="${SENTRY_PROJECT:-}"

if [ -z "$SENTRY_AUTH_TOKEN" ] || [ -z "$SENTRY_ORG" ] || [ -z "$SENTRY_PROJECT" ]; then
  exit 0
fi

LAST_CHECK_FILE="logs/qa/.sentry-last-check"
mkdir -p logs/qa

LAST_CHECK=$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo "2026-01-01T00:00:00")

# Fetch new issues since last check
RESPONSE=$(curl -s "https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved+firstSeen:>${LAST_CHECK}&statsPeriod=1h" \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}")

ISSUE_COUNT=$(echo "$RESPONSE" | jq 'length' 2>/dev/null || echo 0)

if [ "$ISSUE_COUNT" -gt 0 ]; then
  # Check if any issue affects >1 user
  CRITICAL=$(echo "$RESPONSE" | jq '[.[] | select(.userCount > 1)] | length' 2>/dev/null || echo 0)

  if [ "$CRITICAL" -gt 0 ]; then
    DETAILS=$(echo "$RESPONSE" | jq -r '.[] | select(.userCount > 1) | "- \(.title) (\(.userCount) usuarios)"' 2>/dev/null | head -5)
    openclaw message send "🔥 SENTRY — ${CRITICAL} error(es) afectando múltiples usuarios:

${DETAILS}

Ver en: https://sentry.io/organizations/${SENTRY_ORG}/issues/" 2>/dev/null
  fi
fi

# Update last check timestamp
date -u +"%Y-%m-%dT%H:%M:%S" > "$LAST_CHECK_FILE"
