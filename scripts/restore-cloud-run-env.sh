#!/usr/bin/env bash
# restore-cloud-run-env.sh — Restaura env vars de Cloud Run desde backup
#
# Lee ~/.config/steve/env-backup y compara con las vars actuales en Cloud Run.
# Si faltan vars, las agrega automáticamente. Idempotente: correr N veces = mismo resultado.
#
# Formato del backup:
#   NAME=VALUE          → se agrega como --set-env-vars
#   NAME=SECRET:nombre  → se agrega como --set-secrets NAME=nombre:latest
#   NAME=               → se ignora (valor vacío = placeholder)
#   # comentario        → se ignora
#
# Uso:
#   ./scripts/restore-cloud-run-env.sh           # restaurar vars faltantes
#   ./scripts/restore-cloud-run-env.sh --verify   # solo verificar, no modificar
#   ./scripts/restore-cloud-run-env.sh --force    # re-aplicar TODO aunque ya exista

set -euo pipefail

SERVICE="steve-api"
REGION="us-central1"
PROJECT="steveapp-agency"
BACKUP_FILE="${HOME}/.config/steve/env-backup"
MODE="${1:-restore}"  # restore | --verify | --force

source "${HOME}/google-cloud-sdk/path.bash.inc" 2>/dev/null || true

# ─── Validations ────────────────────────────────────────────────────────────

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  echo "Create it with format: NAME=VALUE or NAME=SECRET:secret-name"
  exit 1
fi

# Check file permissions (should be 600)
PERMS=$(stat -c '%a' "$BACKUP_FILE" 2>/dev/null || stat -f '%Lp' "$BACKUP_FILE" 2>/dev/null)
if [ "$PERMS" != "600" ]; then
  echo "WARNING: $BACKUP_FILE has permissions $PERMS, should be 600"
  echo "Run: chmod 600 $BACKUP_FILE"
fi

# ─── Fetch current state ────────────────────────────────────────────────────

echo "[restore] Fetching current env vars from Cloud Run: ${SERVICE}..."

CURRENT_YAML=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format='yaml(spec.template.spec.containers[0].env)' 2>/dev/null) || {
  echo "ERROR: Cannot describe service. Check gcloud auth."
  exit 1
}

# Extract var names (both plain and secret-ref)
CURRENT_NAMES=$(echo "$CURRENT_YAML" | grep "name:" | sed 's/.*name: //' | sort -u)

# ─── Parse backup file ──────────────────────────────────────────────────────

PLAIN_VARS=()       # "KEY=VALUE" entries for --update-env-vars
SECRET_VARS=()      # "KEY=secret:latest" entries for --update-secrets
MISSING_PLAIN=()
MISSING_SECRET=()
PRESENT=()
SKIPPED=()
TOTAL=0

while IFS= read -r line; do
  # Skip comments and blank lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue

  NAME="${line%%=*}"
  VALUE="${line#*=}"

  # Skip empty values (placeholders)
  if [ -z "$VALUE" ]; then
    SKIPPED+=("$NAME")
    continue
  fi

  TOTAL=$((TOTAL + 1))

  # Check if already present (unless --force)
  if [ "$MODE" != "--force" ] && echo "$CURRENT_NAMES" | grep -qw "$NAME"; then
    PRESENT+=("$NAME")
    continue
  fi

  # Classify: secret ref or plain value
  if [[ "$VALUE" == SECRET:* ]]; then
    SECRET_NAME="${VALUE#SECRET:}"
    SECRET_VARS+=("${NAME}=${SECRET_NAME}:latest")
    MISSING_SECRET+=("$NAME")
  else
    PLAIN_VARS+=("${NAME}=${VALUE}")
    MISSING_PLAIN+=("$NAME")
  fi
done < "$BACKUP_FILE"

# ─── Report ─────────────────────────────────────────────────────────────────

MISSING_COUNT=$(( ${#MISSING_PLAIN[@]} + ${#MISSING_SECRET[@]} ))

echo ""
echo "=== ENV VARS STATUS ==="
echo "Total in backup:  $TOTAL"
echo "Present:          ${#PRESENT[@]}"
echo "Missing:          $MISSING_COUNT"
echo "Skipped (empty):  ${#SKIPPED[@]}"
echo ""

for v in "${PRESENT[@]}"; do
  echo "  OK  $v"
done
for v in "${MISSING_PLAIN[@]}"; do
  echo "  ADD $v (plain)"
done
for v in "${MISSING_SECRET[@]}"; do
  echo "  ADD $v (secret ref)"
done
for v in "${SKIPPED[@]}"; do
  echo "  --  $v (no value, skipped)"
done

# ─── Verify mode: just report ───────────────────────────────────────────────

if [ "$MODE" = "--verify" ]; then
  echo ""
  if [ "$MISSING_COUNT" -eq 0 ]; then
    echo "PASS: All env vars present."
    exit 0
  else
    echo "FAIL: $MISSING_COUNT var(s) missing."
    exit 1
  fi
fi

# ─── Restore mode: apply missing vars ───────────────────────────────────────

if [ "$MISSING_COUNT" -eq 0 ]; then
  echo ""
  echo "Nothing to restore. All vars present."
  exit 0
fi

echo ""
echo "[restore] Applying ${MISSING_COUNT} missing var(s) to Cloud Run..."

# Build gcloud command
CMD="gcloud run services update $SERVICE --region $REGION --project $PROJECT"

if [ ${#PLAIN_VARS[@]} -gt 0 ]; then
  PLAIN_CSV=$(IFS=,; echo "${PLAIN_VARS[*]}")
  CMD="$CMD --update-env-vars \"${PLAIN_CSV}\""
fi

if [ ${#SECRET_VARS[@]} -gt 0 ]; then
  SECRET_CSV=$(IFS=,; echo "${SECRET_VARS[*]}")
  CMD="$CMD --update-secrets \"${SECRET_CSV}\""
fi

# Execute
eval "$CMD" 2>&1 | tail -5

echo ""
echo "Restored ${MISSING_COUNT} var(s) successfully."
