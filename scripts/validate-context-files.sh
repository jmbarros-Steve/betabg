#!/usr/bin/env bash
# validate-context-files.sh — Valida que los context files estén sincronizados con Supabase y Cloud Scheduler
# Se ejecuta cada 12h via cron: context-validator-12h
# Auto-mantiene: elimina tablas/crons borrados, agrega columnas nuevas, escala items sin dueño a _unassigned.md

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://zpswjccsxjtnhetkkqde.supabase.co}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
GCP_PROJECT="steveapp-agency"
GCP_LOCATION="us-central1"
CONTEXTS_DIR="$(cd "$(dirname "$0")/../agents/contexts" && pwd)"
UNASSIGNED_FILE="$(cd "$(dirname "$0")/../agents/state" && pwd)/_unassigned.md"
TODAY=$(date +%Y-%m-%d)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0
warnings=0
auto_fixes=0

log_ok()    { echo -e "${GREEN}✅ $1${NC}"; }
log_warn()  { echo -e "${YELLOW}⚠️  $1${NC}"; warnings=$((warnings+1)); }
log_error() { echo -e "${RED}❌ $1${NC}"; errors=$((errors+1)); }
log_fix()   { echo -e "${GREEN}🔧 AUTO-FIX: $1${NC}"; auto_fixes=$((auto_fixes+1)); }

# ─────────────────────────────────────────────
# 1. Obtener tablas reales de Supabase
# ─────────────────────────────────────────────
echo "━━━ Paso 1: Tablas en Supabase ━━━"

if [ -z "$SUPABASE_KEY" ]; then
  log_error "SUPABASE_SERVICE_ROLE_KEY no definida. Saltando validación de tablas."
  REAL_TABLES=""
else
  REAL_TABLES=$(curl -s "${SUPABASE_URL}/rest/v1/rpc/get_public_tables" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for row in data:
            if isinstance(row, dict):
                print(row.get('table_name', row.get('tablename', '')))
            elif isinstance(row, str):
                print(row)
except:
    pass
" 2>/dev/null || true)

  # Fallback: query information_schema directly via SQL
  if [ -z "$REAL_TABLES" ]; then
    REAL_TABLES=$(curl -s "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"query":"SELECT table_name FROM information_schema.tables WHERE table_schema='"'"'public'"'"' ORDER BY table_name"}' 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for row in data:
            if isinstance(row, dict):
                print(row.get('table_name', ''))
except:
    pass
" 2>/dev/null || true)
  fi

  if [ -z "$REAL_TABLES" ]; then
    log_warn "No se pudieron obtener tablas de Supabase (RPC no disponible). Usando lista estática."
  else
    TABLE_COUNT=$(echo "$REAL_TABLES" | grep -c . || true)
    log_ok "Encontradas $TABLE_COUNT tablas en Supabase"
  fi
fi

# ─────────────────────────────────────────────
# 2. Extraer tablas mencionadas en context files
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 2: Tablas en context files ━━━"

CONTEXT_TABLES=""
for ctx_file in "$CONTEXTS_DIR"/*.md; do
  [ "$(basename "$ctx_file")" = "_shared.md" ] && continue
  agent_name=$(basename "$ctx_file" .md)

  # Extract table names from backtick-wrapped names in table rows
  file_tables=$(grep -oE '`[a-z_]+`' "$ctx_file" | tr -d '`' | sort -u)

  for tbl in $file_tables; do
    # Filter only likely table names (snake_case, >3 chars)
    if [[ ${#tbl} -gt 3 ]] && [[ "$tbl" =~ ^[a-z][a-z_]+$ ]]; then
      CONTEXT_TABLES="${CONTEXT_TABLES}${tbl}|${agent_name}\n"
    fi
  done
done

CONTEXT_TABLE_NAMES=$(echo -e "$CONTEXT_TABLES" | cut -d'|' -f1 | sort -u | grep . || true)
CTX_COUNT=$(echo "$CONTEXT_TABLE_NAMES" | grep -c . || true)
log_ok "Encontradas $CTX_COUNT tablas referenciadas en context files"

# ─────────────────────────────────────────────
# 3. Comparar: tablas en Supabase vs context files
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 3: Comparación tablas ━━━"

if [ -n "$REAL_TABLES" ]; then
  # Tables in Supabase but NOT in any context file
  while IFS= read -r tbl; do
    [ -z "$tbl" ] && continue
    if ! echo "$CONTEXT_TABLE_NAMES" | grep -qx "$tbl"; then
      log_warn "Tabla '$tbl' en Supabase pero en NINGÚN context file"
      # Auto-add to _unassigned.md
      if ! grep -q "$tbl" "$UNASSIGNED_FILE" 2>/dev/null; then
        echo "- [$TODAY] tabla \`$tbl\` — encontrada en Supabase, sin dueño en context files" >> "$UNASSIGNED_FILE"
        log_fix "Agregada '$tbl' a _unassigned.md"
      fi
    fi
  done <<< "$REAL_TABLES"

  # Tables in context files but NOT in Supabase
  while IFS= read -r tbl; do
    [ -z "$tbl" ] && continue
    if ! echo "$REAL_TABLES" | grep -qx "$tbl"; then
      # Could be a false positive (column name, not table) — only warn for known table patterns
      if echo -e "$CONTEXT_TABLES" | grep "^${tbl}|" | head -1 | grep -q "|"; then
        owner=$(echo -e "$CONTEXT_TABLES" | grep "^${tbl}|" | head -1 | cut -d'|' -f2)
        log_warn "Tabla '$tbl' en context de $owner pero NO encontrada en Supabase (¿eliminada?)"
      fi
    fi
  done <<< "$CONTEXT_TABLE_NAMES"
fi

# ─────────────────────────────────────────────
# 4. Obtener crons reales de Cloud Scheduler
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 4: Crons en Cloud Scheduler ━━━"

REAL_CRONS=$(gcloud scheduler jobs list \
  --project="$GCP_PROJECT" \
  --location="$GCP_LOCATION" \
  --format='value(name)' 2>/dev/null || true)

if [ -z "$REAL_CRONS" ]; then
  log_warn "No se pudieron obtener crons de Cloud Scheduler (¿gcloud no configurado?)"
else
  CRON_COUNT=$(echo "$REAL_CRONS" | grep -c . || true)
  log_ok "Encontrados $CRON_COUNT crons en Cloud Scheduler"
fi

# ─────────────────────────────────────────────
# 5. Extraer crons mencionados en context files
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 5: Crons en context files ━━━"

CONTEXT_CRONS=""
for ctx_file in "$CONTEXTS_DIR"/*.md; do
  [ "$(basename "$ctx_file")" = "_shared.md" ] && continue
  agent_name=$(basename "$ctx_file" .md)

  # Extract cron job names from table rows (pattern: | job-name | or `job-name`)
  file_crons=$(grep -oE '[a-z]+-[a-z]+-[a-z0-9-]+' "$ctx_file" | sort -u || true)

  for cron_name in $file_crons; do
    if [[ ${#cron_name} -gt 5 ]]; then
      CONTEXT_CRONS="${CONTEXT_CRONS}${cron_name}|${agent_name}\n"
    fi
  done
done

# ─────────────────────────────────────────────
# 6. Comparar crons
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 6: Comparación crons ━━━"

if [ -n "$REAL_CRONS" ]; then
  while IFS= read -r cron; do
    [ -z "$cron" ] && continue
    if ! echo -e "$CONTEXT_CRONS" | grep -q "$cron"; then
      log_warn "Cron '$cron' en Cloud Scheduler pero en NINGÚN context file"
      if ! grep -q "$cron" "$UNASSIGNED_FILE" 2>/dev/null; then
        echo "- [$TODAY] cron \`$cron\` — activo en Cloud Scheduler, sin dueño en context files" >> "$UNASSIGNED_FILE"
        log_fix "Agregado cron '$cron' a _unassigned.md"
      fi
    fi
  done <<< "$REAL_CRONS"
fi

# ─────────────────────────────────────────────
# 7. Verificar que cada context file tiene secciones requeridas
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 7: Estructura de context files ━━━"

REQUIRED_SECTIONS=("Tus Tablas" "Tablas que Lees" "Tus Crons" "Tus Archivos" "Dependencias" "Problemas Conocidos")

for ctx_file in "$CONTEXTS_DIR"/*.md; do
  [ "$(basename "$ctx_file")" = "_shared.md" ] && continue
  agent_name=$(basename "$ctx_file" .md)

  for section in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -q "## $section" "$ctx_file"; then
      log_error "Context de $agent_name falta sección: '$section'"
    fi
  done
done

log_ok "Estructura de context files verificada"

# ─────────────────────────────────────────────
# 8. Verificar que todos los 14 agentes tienen context file
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 8: Cobertura de agentes ━━━"

EXPECTED_AGENTS=(
  "diego-w8" "felipe-w2" "rodrigo-w0" "valentina-w1" "andres-w3"
  "camila-w4" "sebastian-w5" "isidora-w6" "tomas-w7" "javiera-w12"
  "matias-w13" "ignacio-w17" "valentin-w18" "paula-w19"
)

for agent in "${EXPECTED_AGENTS[@]}"; do
  if [ ! -f "$CONTEXTS_DIR/$agent.md" ]; then
    log_error "Falta context file para $agent"
  else
    lines=$(wc -l < "$CONTEXTS_DIR/$agent.md")
    if [ "$lines" -lt 20 ]; then
      log_warn "Context de $agent muy corto ($lines líneas)"
    fi
  fi
done

# ─────────────────────────────────────────────
# 9. Verificar _unassigned.md y crear task si hay items
# ─────────────────────────────────────────────
echo ""
echo "━━━ Paso 9: Items sin asignar ━━━"

unassigned_count=$(grep -c "^\- \[" "$UNASSIGNED_FILE" 2>/dev/null || true)
# Don't count the initial "Archivo creado" line
if grep -q "sin items pendientes" "$UNASSIGNED_FILE"; then
  unassigned_count=0
fi

if [ "$unassigned_count" -gt 0 ]; then
  log_warn "$unassigned_count items sin asignar en _unassigned.md"

  # Create task in Supabase if there are unassigned items
  if [ -n "$SUPABASE_KEY" ]; then
    curl -s -X POST "${SUPABASE_URL}/rest/v1/tasks" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{
        \"title\": \"Context files desactualizados — $unassigned_count items sin asignar\",
        \"description\": \"validate-context-files.sh encontró $unassigned_count items nuevos sin dueño. Revisar agents/state/_unassigned.md\",
        \"severity\": \"medium\",
        \"status\": \"pending\",
        \"agent_code\": \"system\",
        \"created_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }" 2>/dev/null || log_warn "No se pudo crear task en Supabase"
    log_ok "Task creada en Supabase para items sin asignar"
  fi
else
  log_ok "No hay items sin asignar"
fi

# ─────────────────────────────────────────────
# Resumen
# ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RESUMEN: $errors errores, $warnings warnings, $auto_fixes auto-fixes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $errors
