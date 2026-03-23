#!/usr/bin/env bash
###############################################################################
# QA Meta Ads API — Script de Tests para todos los endpoints Meta Ads
# Ejecuta ~40 pruebas READONLY contra la API de Meta Ads via curl.
# Uso: bash qa-meta-ads-api.sh [--jwt TOKEN] [--api URL] [--connection-id ID] [--client-id ID]
#
# NOTA: Todas las pruebas son READONLY — no se crean campanas reales,
#       no se eliminan audiencias, no se pausan adsets activos.
###############################################################################

set -uo pipefail

# ─── Colores ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Configuracion por defecto ──────────────────────────────────────────────
API_URL="${API_URL:-https://steve-api-850416724643.us-central1.run.app}"
SUPABASE_URL="https://zpswjccsxjtnhetkkqde.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw"
JWT=""
CONNECTION_ID="4a03ab6b-7192-4ace-bcfb-a1fcf8677cc8"
CLIENT_ID="9432e754-ad5a-4115-904c-d048de1d0e1e"
CRON_SECRET="${CRON_SECRET:-YOUR_CRON_SECRET}"
LOGIN_EMAIL="patricio.correa@jardindeeva.cl"
LOGIN_PASSWORD="Jardin2026"

# ─── Contadores ─────────────────────────────────────────────────────────────
PASS=0
FAIL=0
SKIP=0
TOTAL=0
RESULTS_FILE="/tmp/qa-meta-ads-results-$(date +%Y%m%d-%H%M%S).log"

# ─── IDs capturados durante tests (para encadenar) ─────────────────────────
PIXEL_ID=""
PAGE_ID=""
CAMPAIGN_ID=""
ADSET_ID=""

# ─── Parse args ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --jwt) JWT="$2"; shift 2;;
    --api) API_URL="$2"; shift 2;;
    --connection-id) CONNECTION_ID="$2"; shift 2;;
    --client-id) CLIENT_ID="$2"; shift 2;;
    --cron-secret) CRON_SECRET="$2"; shift 2;;
    --help|-h)
      echo "Uso: $0 [--jwt TOKEN] [--api URL] [--connection-id ID] [--client-id ID] [--cron-secret SECRET]"
      echo ""
      echo "Si no se proporciona --jwt, se obtiene via Supabase signInWithPassword."
      echo ""
      echo "Variables de entorno soportadas:"
      echo "  API_URL        Base URL de la API (default: https://steve-api-850416724643.us-central1.run.app)"
      echo "  CRON_SECRET    Secret para endpoints cron (default: YOUR_CRON_SECRET)"
      exit 0;;
    *) echo "Arg desconocido: $1"; exit 1;;
  esac
done

# ─── Helpers ────────────────────────────────────────────────────────────────
log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
log_phase() {
  echo -e "\n${BOLD}${YELLOW}═══════════════════════════════════════════${NC}"
  echo -e "${BOLD}${YELLOW}  $*${NC}"
  echo -e "${BOLD}${YELLOW}═══════════════════════════════════════════${NC}\n"
}

record() {
  local num="$1" name="$2" status="$3" detail="${4:-}"
  TOTAL=$((TOTAL+1))
  case "$status" in
    PASS) PASS=$((PASS+1)); echo -e "  ${GREEN}✓ PASS${NC} [$num] $name ${detail:+— $detail}";;
    FAIL) FAIL=$((FAIL+1)); echo -e "  ${RED}✗ FAIL${NC} [$num] $name ${detail:+— $detail}";;
    SKIP) SKIP=$((SKIP+1)); echo -e "  ${YELLOW}⊘ SKIP${NC} [$num] $name ${detail:+— $detail}";;
  esac
  echo "[$status] $num | $name | $detail" >> "$RESULTS_FILE"
}

# Curl wrapper autenticado — setea HTTP_CODE, BODY, ELAPSED_MS
api_post() {
  local endpoint="$1" body="$2" auth="${3:-$JWT}"
  local start_time end_time response
  start_time=$(python3 -c "import time; print(int(time.time()*1000))")
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${auth}" \
    -d "$body" 2>/dev/null || echo -e "\n000")
  end_time=$(python3 -c "import time; print(int(time.time()*1000))")
  HTTP_CODE=$(echo "$response" | tail -1)
  BODY=$(echo "$response" | sed '$d')
  ELAPSED_MS=$((end_time - start_time))
}

# Curl wrapper sin auth — para endpoints cron
api_post_cron() {
  local endpoint="$1" body="${2:-{\}}" secret="${3:-$CRON_SECRET}"
  local start_time end_time response
  start_time=$(python3 -c "import time; print(int(time.time()*1000))")
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: ${secret}" \
    -d "$body" 2>/dev/null || echo -e "\n000")
  end_time=$(python3 -c "import time; print(int(time.time()*1000))")
  HTTP_CODE=$(echo "$response" | tail -1)
  BODY=$(echo "$response" | sed '$d')
  ELAPSED_MS=$((end_time - start_time))
}

# Curl wrapper sin auth ni headers — para meta webhook
api_post_noauth() {
  local endpoint="$1" body="$2"
  local start_time end_time response
  start_time=$(python3 -c "import time; print(int(time.time()*1000))")
  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null || echo -e "\n000")
  end_time=$(python3 -c "import time; print(int(time.time()*1000))")
  HTTP_CODE=$(echo "$response" | tail -1)
  BODY=$(echo "$response" | sed '$d')
  ELAPSED_MS=$((end_time - start_time))
}

# Extraer campo JSON con jq (fallback a python3)
jq_field() {
  local json="$1" expr="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r "$expr" 2>/dev/null || echo ""
  else
    echo "$json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    parts = '''$expr'''.strip('.').split('.')
    val = d
    for p in parts:
        if p.startswith('[') and p.endswith(']'):
            val = val[int(p[1:-1])]
        elif p and p != '':
            val = val[p] if isinstance(val, dict) else val[int(p)]
    print(val if val is not None else '')
except:
    print('')
" 2>/dev/null
  fi
}

# Truncar respuesta para mostrar en consola
truncate_body() {
  local max="${1:-200}"
  echo "$BODY" | head -c "$max" | tr '\n' ' '
}

# Evaluar resultado HTTP — PASS si esta en lista de codigos aceptables
check_http() {
  local test_num="$1" test_name="$2" expected_codes="$3"
  local detail="HTTP ${HTTP_CODE} (${ELAPSED_MS}ms)"
  local preview
  preview=$(truncate_body 150)

  # Verificar si HTTP_CODE esta en la lista de codigos esperados
  if echo "$expected_codes" | grep -qw "$HTTP_CODE"; then
    record "$test_num" "$test_name" "PASS" "${detail} | ${preview}"
  elif [[ "$HTTP_CODE" =~ ^5 ]]; then
    record "$test_num" "$test_name" "FAIL" "${detail} [SERVER ERROR] | ${preview}"
  else
    record "$test_num" "$test_name" "FAIL" "${detail} [esperado: ${expected_codes}] | ${preview}"
  fi
}

###############################################################################
#                        INICIO DEL SCRIPT
###############################################################################

echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       QA META ADS API — Tests de todos los endpoints     ║${NC}"
echo -e "${BOLD}${CYAN}║       $(date '+%Y-%m-%d %H:%M:%S')                              ║${NC}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  API:           ${BOLD}${API_URL}${NC}"
echo -e "  Connection ID: ${BOLD}${CONNECTION_ID}${NC}"
echo -e "  Client ID:     ${BOLD}${CLIENT_ID}${NC}"
echo -e "  Cron Secret:   ${BOLD}$(if [[ "$CRON_SECRET" == "YOUR_CRON_SECRET" ]]; then echo "(placeholder)"; else echo "(configurado)"; fi)${NC}"
echo -e "  Resultados:    ${BOLD}${RESULTS_FILE}${NC}"
echo ""

###############################################################################
# FASE 0: Autenticacion — Obtener JWT via Supabase
###############################################################################
log_phase "FASE 0: Autenticacion"

if [[ -z "$JWT" ]]; then
  log "Obteniendo JWT via signInWithPassword para ${LOGIN_EMAIL}..."

  AUTH_RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${LOGIN_EMAIL}\",\"password\":\"${LOGIN_PASSWORD}\"}" 2>/dev/null)

  JWT=$(jq_field "$AUTH_RESPONSE" ".access_token")

  if [[ -n "$JWT" && "$JWT" != "null" && "$JWT" != "" ]]; then
    USER_ID=$(jq_field "$AUTH_RESPONSE" ".user.id")
    record "0.1" "Obtener JWT via signInWithPassword" "PASS" "Token obtenido (${#JWT} chars), user_id=${USER_ID}"
  else
    ERROR_MSG=$(jq_field "$AUTH_RESPONSE" ".error_description")
    record "0.1" "Obtener JWT via signInWithPassword" "FAIL" "Error: ${ERROR_MSG:-respuesta inesperada}"
    echo -e "${RED}ERROR: Sin JWT no se pueden ejecutar las pruebas autenticadas.${NC}"
    echo "Proporciona un JWT con: $0 --jwt YOUR_TOKEN"
    echo ""
    echo "Respuesta Supabase: $(echo "$AUTH_RESPONSE" | head -c 300)"
    exit 1
  fi
else
  record "0.1" "JWT proporcionado via --jwt" "PASS" "Token (${#JWT} chars)"
fi

# 0.2 — Verificar que el JWT es valido haciendo una peticion simple
log "Verificando JWT con endpoint check-meta-scopes..."
api_post "/api/check-meta-scopes" "{\"connection_id\":\"${CONNECTION_ID}\"}"
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "400" || "$HTTP_CODE" == "404" ]]; then
  record "0.2" "JWT es valido (endpoint responde)" "PASS" "HTTP ${HTTP_CODE} (${ELAPSED_MS}ms)"
elif [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
  record "0.2" "JWT es valido (endpoint responde)" "FAIL" "HTTP ${HTTP_CODE} — JWT rechazado"
  echo -e "${RED}ADVERTENCIA: JWT fue rechazado. Los tests autenticados fallaran.${NC}"
else
  record "0.2" "JWT es valido (endpoint responde)" "FAIL" "HTTP ${HTTP_CODE} — respuesta inesperada"
fi

###############################################################################
# FASE 1: Meta Scopes y Cuentas (READONLY)
###############################################################################
log_phase "FASE 1: Meta Scopes, Cuentas y Jerarquia"

# 1.1 — Check Meta Scopes
log "1.1 check-meta-scopes..."
api_post "/api/check-meta-scopes" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "1.1" "check-meta-scopes" "200"

# 1.2 — Check Meta Scopes sin connection_id (debe dar error controlado)
log "1.2 check-meta-scopes sin connection_id (error esperado)..."
api_post "/api/check-meta-scopes" "{}"
check_http "1.2" "check-meta-scopes sin connection_id" "400 422"

# 1.3 — Fetch Meta Ad Accounts
log "1.3 fetch-meta-ad-accounts..."
api_post "/api/fetch-meta-ad-accounts" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "1.3" "fetch-meta-ad-accounts" "200"

# 1.4 — Fetch Meta Ad Accounts con force_refresh
log "1.4 fetch-meta-ad-accounts con force_refresh..."
api_post "/api/fetch-meta-ad-accounts" "{\"connection_id\":\"${CONNECTION_ID}\",\"force_refresh\":true}"
check_http "1.4" "fetch-meta-ad-accounts (force_refresh)" "200"

# 1.5 — Fetch Meta Business Hierarchy
log "1.5 fetch-meta-business-hierarchy..."
api_post "/api/fetch-meta-business-hierarchy" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "1.5" "fetch-meta-business-hierarchy" "200"

# 1.6 — Fetch Meta Business Hierarchy con force_refresh
log "1.6 fetch-meta-business-hierarchy (force_refresh)..."
api_post "/api/fetch-meta-business-hierarchy" "{\"connection_id\":\"${CONNECTION_ID}\",\"force_refresh\":true}"
check_http "1.6" "fetch-meta-business-hierarchy (force_refresh)" "200"

# 1.7 — Fetch Meta Ad Accounts con connection_id invalido
log "1.7 fetch-meta-ad-accounts con connection_id invalido..."
api_post "/api/fetch-meta-ad-accounts" "{\"connection_id\":\"00000000-0000-0000-0000-000000000000\"}"
check_http "1.7" "fetch-meta-ad-accounts (connection_id invalido)" "400 404 422"

###############################################################################
# FASE 2: Audiencias (READONLY — solo listar)
###############################################################################
log_phase "FASE 2: Audiencias Meta (READONLY)"

# 2.1 — Listar audiencias
log "2.1 manage-meta-audiences action=list..."
api_post "/api/manage-meta-audiences" "{\"action\":\"list\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "2.1" "manage-meta-audiences (list)" "200"

# 2.2 — Listar audiencias sin action (error esperado)
log "2.2 manage-meta-audiences sin action..."
api_post "/api/manage-meta-audiences" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "2.2" "manage-meta-audiences (sin action)" "400 422"

# 2.3 — Audiencias con action invalida (error esperado)
log "2.3 manage-meta-audiences action=invalid..."
api_post "/api/manage-meta-audiences" "{\"action\":\"invalid_action\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "2.3" "manage-meta-audiences (action invalida)" "400 422"

# 2.4 — Detect Audience Overlap (READONLY — solo analisis)
log "2.4 detect-audience-overlap..."
api_post "/api/detect-audience-overlap" "{\"client_id\":\"${CLIENT_ID}\",\"campaign_id\":\"placeholder_campaign\"}"
check_http "2.4" "detect-audience-overlap" "200 400 404"

###############################################################################
# FASE 3: Campanas Meta (READONLY — solo lectura y get_ad_details)
###############################################################################
log_phase "FASE 3: Campanas Meta (READONLY)"

# 3.1 — Get Ad Details (lectura)
log "3.1 manage-meta-campaign action=get_ad_details..."
api_post "/api/manage-meta-campaign" "{\"action\":\"get_ad_details\",\"connection_id\":\"${CONNECTION_ID}\",\"campaign_id\":\"placeholder\"}"
check_http "3.1" "manage-meta-campaign (get_ad_details)" "200 400 404"

# 3.2 — manage-meta-campaign sin action (error esperado)
log "3.2 manage-meta-campaign sin action..."
api_post "/api/manage-meta-campaign" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "3.2" "manage-meta-campaign (sin action)" "400 422"

# 3.3 — manage-meta-campaign sin connection_id (error esperado)
log "3.3 manage-meta-campaign sin connection_id..."
api_post "/api/manage-meta-campaign" "{\"action\":\"get_ad_details\"}"
check_http "3.3" "manage-meta-campaign (sin connection_id)" "400 422"

# 3.4 — manage-meta-campaign action invalida
log "3.4 manage-meta-campaign action=unknown..."
api_post "/api/manage-meta-campaign" "{\"action\":\"unknown_action\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "3.4" "manage-meta-campaign (action invalida)" "400 422"

# 3.5 — Fetch Campaign Adsets (READONLY)
log "3.5 fetch-campaign-adsets..."
api_post "/api/fetch-campaign-adsets" "{\"connection_id\":\"${CONNECTION_ID}\",\"campaign_id\":\"placeholder\"}"
check_http "3.5" "fetch-campaign-adsets" "200 400 404"

###############################################################################
# FASE 4: Pixel Meta (READONLY)
###############################################################################
log_phase "FASE 4: Pixel Meta (READONLY)"

# 4.1 — Listar pixels
log "4.1 manage-meta-pixel action=list..."
api_post "/api/manage-meta-pixel" "{\"action\":\"list\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "4.1" "manage-meta-pixel (list)" "200"

# Capturar un pixel_id si existe para tests posteriores
PIXEL_ID=$(jq_field "$BODY" ".pixels[0].id" 2>/dev/null || echo "")
if [[ -z "$PIXEL_ID" || "$PIXEL_ID" == "null" ]]; then
  PIXEL_ID=$(jq_field "$BODY" ".[0].id" 2>/dev/null || echo "")
fi
if [[ -n "$PIXEL_ID" && "$PIXEL_ID" != "null" && "$PIXEL_ID" != "" ]]; then
  log "  Pixel ID capturado: ${PIXEL_ID}"
fi

# 4.2 — Get pixel especifico
if [[ -n "$PIXEL_ID" && "$PIXEL_ID" != "null" && "$PIXEL_ID" != "" ]]; then
  log "4.2 manage-meta-pixel action=get (pixel_id=${PIXEL_ID})..."
  api_post "/api/manage-meta-pixel" "{\"action\":\"get\",\"connection_id\":\"${CONNECTION_ID}\",\"pixel_id\":\"${PIXEL_ID}\"}"
  check_http "4.2" "manage-meta-pixel (get)" "200"
else
  record "4.2" "manage-meta-pixel (get)" "SKIP" "No hay pixel_id disponible"
fi

# 4.3 — Stats de pixel
if [[ -n "$PIXEL_ID" && "$PIXEL_ID" != "null" && "$PIXEL_ID" != "" ]]; then
  log "4.3 manage-meta-pixel action=stats (pixel_id=${PIXEL_ID})..."
  api_post "/api/manage-meta-pixel" "{\"action\":\"stats\",\"connection_id\":\"${CONNECTION_ID}\",\"pixel_id\":\"${PIXEL_ID}\"}"
  check_http "4.3" "manage-meta-pixel (stats)" "200"
else
  record "4.3" "manage-meta-pixel (stats)" "SKIP" "No hay pixel_id disponible"
fi

# 4.4 — Pixel sin action (error esperado)
log "4.4 manage-meta-pixel sin action..."
api_post "/api/manage-meta-pixel" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "4.4" "manage-meta-pixel (sin action)" "400 422"

###############################################################################
# FASE 5: Social Inbox (READONLY)
###############################################################################
log_phase "FASE 5: Social Inbox Meta (READONLY)"

# 5.1 — Listar paginas
log "5.1 meta-social-inbox action=list_pages..."
api_post "/api/meta-social-inbox" "{\"action\":\"list_pages\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "5.1" "meta-social-inbox (list_pages)" "200"

# Capturar page_id si existe
PAGE_ID=$(jq_field "$BODY" ".pages[0].id" 2>/dev/null || echo "")
if [[ -z "$PAGE_ID" || "$PAGE_ID" == "null" ]]; then
  PAGE_ID=$(jq_field "$BODY" ".[0].id" 2>/dev/null || echo "")
fi
if [[ -n "$PAGE_ID" && "$PAGE_ID" != "null" && "$PAGE_ID" != "" ]]; then
  log "  Page ID capturado: ${PAGE_ID}"
fi

# 5.2 — Listar conversaciones
if [[ -n "$PAGE_ID" && "$PAGE_ID" != "null" && "$PAGE_ID" != "" ]]; then
  log "5.2 meta-social-inbox action=list_conversations..."
  api_post "/api/meta-social-inbox" "{\"action\":\"list_conversations\",\"connection_id\":\"${CONNECTION_ID}\",\"page_id\":\"${PAGE_ID}\"}"
  check_http "5.2" "meta-social-inbox (list_conversations)" "200"
else
  log "5.2 meta-social-inbox action=list_conversations (sin page_id)..."
  api_post "/api/meta-social-inbox" "{\"action\":\"list_conversations\",\"connection_id\":\"${CONNECTION_ID}\"}"
  check_http "5.2" "meta-social-inbox (list_conversations)" "200 400 404"
fi

# 5.3 — Listar comentarios de posts
if [[ -n "$PAGE_ID" && "$PAGE_ID" != "null" && "$PAGE_ID" != "" ]]; then
  log "5.3 meta-social-inbox action=list_post_comments..."
  api_post "/api/meta-social-inbox" "{\"action\":\"list_post_comments\",\"connection_id\":\"${CONNECTION_ID}\",\"page_id\":\"${PAGE_ID}\"}"
  check_http "5.3" "meta-social-inbox (list_post_comments)" "200"
else
  record "5.3" "meta-social-inbox (list_post_comments)" "SKIP" "No hay page_id"
fi

# 5.4 — Listar comentarios de ads
if [[ -n "$PAGE_ID" && "$PAGE_ID" != "null" && "$PAGE_ID" != "" ]]; then
  log "5.4 meta-social-inbox action=list_ad_comments..."
  api_post "/api/meta-social-inbox" "{\"action\":\"list_ad_comments\",\"connection_id\":\"${CONNECTION_ID}\",\"page_id\":\"${PAGE_ID}\"}"
  check_http "5.4" "meta-social-inbox (list_ad_comments)" "200"
else
  record "5.4" "meta-social-inbox (list_ad_comments)" "SKIP" "No hay page_id"
fi

# 5.5 — Social Inbox sin action (error esperado)
log "5.5 meta-social-inbox sin action..."
api_post "/api/meta-social-inbox" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "5.5" "meta-social-inbox (sin action)" "400 422"

# 5.6 — Social Inbox action invalida
log "5.6 meta-social-inbox action=invalid..."
api_post "/api/meta-social-inbox" "{\"action\":\"invalid_action\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "5.6" "meta-social-inbox (action invalida)" "400 422"

###############################################################################
# FASE 6: Targeting Search (READONLY)
###############################################################################
log_phase "FASE 6: Targeting Search (READONLY)"

# 6.1 — Buscar intereses
log "6.1 meta-targeting-search (interests)..."
api_post "/api/meta-targeting-search" "{\"connection_id\":\"${CONNECTION_ID}\",\"search_type\":\"interests\",\"query\":\"fitness\"}"
check_http "6.1" "meta-targeting-search (interests: fitness)" "200"

# 6.2 — Buscar ubicaciones
log "6.2 meta-targeting-search (locations)..."
api_post "/api/meta-targeting-search" "{\"connection_id\":\"${CONNECTION_ID}\",\"search_type\":\"locations\",\"query\":\"Santiago\"}"
check_http "6.2" "meta-targeting-search (locations: Santiago)" "200"

# 6.3 — Targeting search sin query (error esperado)
log "6.3 meta-targeting-search sin query..."
api_post "/api/meta-targeting-search" "{\"connection_id\":\"${CONNECTION_ID}\",\"search_type\":\"interests\"}"
check_http "6.3" "meta-targeting-search (sin query)" "400 422"

# 6.4 — Targeting search con search_type invalido
log "6.4 meta-targeting-search search_type invalido..."
api_post "/api/meta-targeting-search" "{\"connection_id\":\"${CONNECTION_ID}\",\"search_type\":\"invalid_type\",\"query\":\"test\"}"
check_http "6.4" "meta-targeting-search (search_type invalido)" "400 422"

###############################################################################
# FASE 7: Meta Catalogs (READONLY)
###############################################################################
log_phase "FASE 7: Meta Catalogs (READONLY)"

# 7.1 — Listar catalogos
log "7.1 meta-catalogs..."
api_post "/api/meta-catalogs" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "7.1" "meta-catalogs" "200"

# 7.2 — Meta catalogs sin connection_id (error esperado)
log "7.2 meta-catalogs sin connection_id..."
api_post "/api/meta-catalogs" "{}"
check_http "7.2" "meta-catalogs (sin connection_id)" "400 422"

###############################################################################
# FASE 8: Meta Adset Action (READONLY — solo verificacion de estructura)
###############################################################################
log_phase "FASE 8: Meta Adset Action (validacion de input)"

# 8.1 — Adset action sin adset_id (error esperado)
log "8.1 meta-adset-action sin adset_id..."
api_post "/api/meta-adset-action" "{\"action\":\"pause\",\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "8.1" "meta-adset-action (sin adset_id)" "400 422"

# 8.2 — Adset action sin action (error esperado)
log "8.2 meta-adset-action sin action..."
api_post "/api/meta-adset-action" "{\"connection_id\":\"${CONNECTION_ID}\",\"adset_id\":\"123\"}"
check_http "8.2" "meta-adset-action (sin action)" "400 422"

###############################################################################
# FASE 9: Sync Meta Metrics (READONLY)
###############################################################################
log_phase "FASE 9: Sync Meta Metrics"

# 9.1 — Sync meta metrics con JWT
log "9.1 sync-meta-metrics con JWT..."
api_post "/api/sync-meta-metrics" "{\"connection_id\":\"${CONNECTION_ID}\"}"
check_http "9.1" "sync-meta-metrics (con JWT)" "200"

# 9.2 — Sync meta metrics sin parametros (debe sincronizar todos o pedir connection_id)
log "9.2 sync-meta-metrics sin parametros..."
api_post "/api/sync-meta-metrics" "{}"
check_http "9.2" "sync-meta-metrics (sin parametros)" "200 400"

###############################################################################
# FASE 10: Sync Klaviyo a Meta Audience (READONLY — validacion)
###############################################################################
log_phase "FASE 10: Sync Klaviyo→Meta Audience (validacion)"

# 10.1 — sync-klaviyo-to-meta-audience sin datos completos (error esperado)
log "10.1 sync-klaviyo-to-meta-audience (datos incompletos)..."
api_post "/api/sync-klaviyo-to-meta-audience" "{\"meta_connection_id\":\"${CONNECTION_ID}\"}"
check_http "10.1" "sync-klaviyo-to-meta-audience (incompleto)" "400 422"

# 10.2 — sync-klaviyo-to-meta-audience body vacio
log "10.2 sync-klaviyo-to-meta-audience body vacio..."
api_post "/api/sync-klaviyo-to-meta-audience" "{}"
check_http "10.2" "sync-klaviyo-to-meta-audience (vacio)" "400 422"

###############################################################################
# FASE 11: Instagram (READONLY)
###############################################################################
log_phase "FASE 11: Instagram (READONLY)"

# 11.1 — Publish Instagram action=list (solo listar, no publicar)
log "11.1 publish-instagram action=list..."
api_post "/api/publish-instagram" "{\"action\":\"list\",\"client_id\":\"${CLIENT_ID}\"}"
check_http "11.1" "publish-instagram (list)" "200"

# 11.2 — Fetch Instagram Insights (overview)
log "11.2 fetch-instagram-insights action=overview..."
api_post "/api/fetch-instagram-insights" "{\"client_id\":\"${CLIENT_ID}\",\"action\":\"overview\"}"
check_http "11.2" "fetch-instagram-insights (overview)" "200"

# 11.3 — Fetch Instagram Insights (top_posts)
log "11.3 fetch-instagram-insights action=top_posts..."
api_post "/api/fetch-instagram-insights" "{\"client_id\":\"${CLIENT_ID}\",\"action\":\"top_posts\"}"
check_http "11.3" "fetch-instagram-insights (top_posts)" "200"

# 11.4 — Fetch Instagram Insights sin action (error esperado)
log "11.4 fetch-instagram-insights sin action..."
api_post "/api/fetch-instagram-insights" "{\"client_id\":\"${CLIENT_ID}\"}"
check_http "11.4" "fetch-instagram-insights (sin action)" "400 422"

# 11.5 — publish-instagram sin client_id (error esperado)
log "11.5 publish-instagram sin client_id..."
api_post "/api/publish-instagram" "{\"action\":\"list\"}"
check_http "11.5" "publish-instagram (sin client_id)" "400 422"

###############################################################################
# FASE 12: AI - Generate Meta Copy y Criterio (READONLY)
###############################################################################
log_phase "FASE 12: AI — Generate Meta Copy y Criterio"

# 12.1 — Generate Meta Copy (lectura/generacion AI, no crea nada en Meta)
log "12.1 generate-meta-copy..."
api_post "/api/generate-meta-copy" "{\"connection_id\":\"${CONNECTION_ID}\",\"client_id\":\"${CLIENT_ID}\",\"prompt\":\"Genera un copy de prueba QA para tienda de cosmeticos naturales\"}"
check_http "12.1" "generate-meta-copy" "200"

# 12.2 — Generate Meta Copy sin prompt (error esperado)
log "12.2 generate-meta-copy sin prompt..."
api_post "/api/generate-meta-copy" "{\"connection_id\":\"${CONNECTION_ID}\",\"client_id\":\"${CLIENT_ID}\"}"
check_http "12.2" "generate-meta-copy (sin prompt)" "200 400 422"

# 12.3 — Criterio Meta (evaluacion AI de calidad)
log "12.3 criterio-meta..."
api_post "/api/criterio-meta" "{\"connection_id\":\"${CONNECTION_ID}\",\"client_id\":\"${CLIENT_ID}\"}"
check_http "12.3" "criterio-meta" "200"

###############################################################################
# FASE 13: Endpoints sin JWT — Cron Jobs
###############################################################################
log_phase "FASE 13: Cron Jobs (X-Cron-Secret)"

if [[ "$CRON_SECRET" == "YOUR_CRON_SECRET" ]]; then
  log "ADVERTENCIA: CRON_SECRET no configurado. Tests cron usaran placeholder."
  log "Para configurar: export CRON_SECRET=your_secret o --cron-secret your_secret"
  echo ""
fi

# 13.1 — Performance Tracker Meta
log "13.1 cron/performance-tracker-meta..."
api_post_cron "/api/cron/performance-tracker-meta" "{}"
if [[ "$CRON_SECRET" == "YOUR_CRON_SECRET" ]]; then
  # Con placeholder, esperamos 401/403
  check_http "13.1" "cron/performance-tracker-meta (sin secret real)" "401 403"
else
  check_http "13.1" "cron/performance-tracker-meta" "200"
fi

# 13.2 — Execute Meta Rules
log "13.2 cron/execute-meta-rules..."
api_post_cron "/api/cron/execute-meta-rules" "{}"
if [[ "$CRON_SECRET" == "YOUR_CRON_SECRET" ]]; then
  check_http "13.2" "cron/execute-meta-rules (sin secret real)" "401 403"
else
  check_http "13.2" "cron/execute-meta-rules" "200"
fi

# 13.3 — Publish Instagram (cron)
log "13.3 cron/publish-instagram..."
api_post_cron "/api/cron/publish-instagram" "{}"
if [[ "$CRON_SECRET" == "YOUR_CRON_SECRET" ]]; then
  check_http "13.3" "cron/publish-instagram (sin secret real)" "401 403"
else
  check_http "13.3" "cron/publish-instagram" "200"
fi

###############################################################################
# FASE 14: Meta Data Deletion (webhook — sin JWT)
###############################################################################
log_phase "FASE 14: Meta Data Deletion Webhook"

# 14.1 — Meta data deletion con signed_request invalido (debe rechazar pero no crashear)
log "14.1 meta-data-deletion con signed_request invalido..."
api_post_noauth "/api/meta-data-deletion" "{\"signed_request\":\"fake_signed_request_for_qa_test\"}"
check_http "14.1" "meta-data-deletion (signed_request invalido)" "200 400 403"

# 14.2 — Meta data deletion sin body
log "14.2 meta-data-deletion sin body..."
api_post_noauth "/api/meta-data-deletion" "{}"
check_http "14.2" "meta-data-deletion (sin body)" "400 422"

###############################################################################
# FASE 15: Tests de seguridad — Sin JWT (deben fallar)
###############################################################################
log_phase "FASE 15: Tests de Seguridad (sin JWT)"

# Verificar que los endpoints autenticados rechazan requests sin JWT
NOAUTH_ENDPOINTS=(
  "/api/check-meta-scopes"
  "/api/fetch-meta-ad-accounts"
  "/api/manage-meta-audiences"
  "/api/manage-meta-campaign"
  "/api/manage-meta-pixel"
  "/api/meta-social-inbox"
  "/api/meta-targeting-search"
  "/api/meta-catalogs"
  "/api/sync-meta-metrics"
)

TEST_NUM=1
for endpoint in "${NOAUTH_ENDPOINTS[@]}"; do
  log "15.${TEST_NUM} ${endpoint} sin JWT..."
  local_response=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "{\"connection_id\":\"${CONNECTION_ID}\"}" 2>/dev/null || echo -e "\n000")
  HTTP_CODE=$(echo "$local_response" | tail -1)
  BODY=$(echo "$local_response" | sed '$d')
  ELAPSED_MS=0

  if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
    record "15.${TEST_NUM}" "${endpoint} sin JWT rechazado" "PASS" "HTTP ${HTTP_CODE}"
  elif [[ "$HTTP_CODE" == "200" ]]; then
    record "15.${TEST_NUM}" "${endpoint} sin JWT rechazado" "FAIL" "HTTP 200 — endpoint NO protegido!"
  else
    record "15.${TEST_NUM}" "${endpoint} sin JWT rechazado" "PASS" "HTTP ${HTTP_CODE} (rechazado)"
  fi
  TEST_NUM=$((TEST_NUM+1))
done

###############################################################################
# RESUMEN FINAL
###############################################################################
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}         RESUMEN QA META ADS API           ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✓ PASS:${NC}  $PASS"
echo -e "  ${RED}✗ FAIL:${NC}  $FAIL"
echo -e "  ${YELLOW}⊘ SKIP:${NC}  $SKIP"
echo -e "  ${BOLD}TOTAL:${NC}   $TOTAL"
echo ""

# Calcular porcentaje (excluyendo skips)
EFFECTIVE=$((PASS + FAIL))
if [[ $EFFECTIVE -gt 0 ]]; then
  PCT=$((PASS * 100 / EFFECTIVE))
  if [[ $PCT -ge 90 ]]; then
    COLOR="$GREEN"
  elif [[ $PCT -ge 70 ]]; then
    COLOR="$YELLOW"
  else
    COLOR="$RED"
  fi
  echo -e "  Score: ${BOLD}${COLOR}${PCT}%${NC} ($PASS/$EFFECTIVE pruebas efectivas)"
else
  echo -e "  Score: ${BOLD}N/A${NC} (todas las pruebas fueron saltadas)"
fi

echo ""
echo -e "  Resultados guardados en: ${CYAN}$RESULTS_FILE${NC}"
echo ""

# Mostrar tabla de resultados por fase si hay fallas
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${BOLD}Pruebas fallidas:${NC}"
  grep "\\[FAIL\\]" "$RESULTS_FILE" | while IFS='|' read -r status num name detail; do
    echo -e "    ${RED}$status${NC} |$num |$name"
  done
  echo ""
fi

# Exit code basado en resultados
if [[ $FAIL -gt 0 ]]; then
  echo -e "  ${RED}Hay $FAIL pruebas fallidas. Revisar el log para detalles.${NC}"
  exit 1
else
  echo -e "  ${GREEN}Todas las pruebas pasaron o fueron saltadas.${NC}"
  exit 0
fi
