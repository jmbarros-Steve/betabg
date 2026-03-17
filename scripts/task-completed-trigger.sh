#!/bin/bash
# task-completed-trigger.sh — Leonardo calls this when a task is completed.
# It hits the Cloud Run endpoint, gets the QA scope, and sends Javiera (W12)
# a tmux command to run QA on the affected module.
#
# Usage: ./scripts/task-completed-trigger.sh <task_id>

set -e

TASK_ID="$1"
if [ -z "$TASK_ID" ]; then
  echo "❌ Usage: $0 <task_id>"
  exit 1
fi

API_URL="${STEVE_API_URL:-https://steve-api-850416724643.us-central1.run.app}"
CRON_SECRET="${CRON_SECRET:-}"

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET env var required"
  exit 1
fi

echo "📋 Task completed: $TASK_ID"
echo "🔄 Calling task-completed endpoint..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${API_URL}/api/task-completed" \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"task_id\": \"${TASK_ID}\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ API error (HTTP $HTTP_CODE): $BODY"
  exit 1
fi

# Extract QA scope
QA_SCOPE=$(echo "$BODY" | jq -r '.qa_scope // "full"')
TASK_TITLE=$(echo "$BODY" | jq -r '.task_title // "unknown"')
POSTMORTEM=$(echo "$BODY" | jq -r '.postmortem_triggered // false')

echo "✅ Task: $TASK_TITLE"
echo "🎯 QA scope: $QA_SCOPE"
echo "📝 Postmortem: $POSTMORTEM"

# Send to Javiera (W12) via tmux
if tmux has-session -t steve 2>/dev/null; then
  echo "🚀 Triggering Javiera (W12) via tmux..."
  tmux send-keys -t steve:12 "/qa ${QA_SCOPE} --task=${TASK_ID}" Enter
  echo "✅ Javiera notified: /qa ${QA_SCOPE} --task=${TASK_ID}"
else
  echo "⚠️  tmux session 'steve' not found — QA scope logged but not triggered"
  echo "    Manual command: tmux send-keys -t steve:12 '/qa ${QA_SCOPE} --task=${TASK_ID}' Enter"
fi
