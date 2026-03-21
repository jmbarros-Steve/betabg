#!/usr/bin/env bash
# ============================================================
# Smoke test: Meta Campaign error paths against deployed API
#
# Tests that the API returns 502 (not 207) when Meta operations
# partially fail. Uses payloads designed to trigger specific errors.
#
# Prerequisites:
#   - SUPABASE_URL and SUPABASE_SERVICE_KEY env vars set
#   - API_URL env var (defaults to https://steve-api-...-uc.a.run.app)
#   - A valid connection_id with Meta credentials
#
# Usage:
#   export SUPABASE_URL="https://zpswjccsxjtnhetkkqde.supabase.co"
#   export SUPABASE_SERVICE_KEY="eyJ..."
#   export API_URL="https://steve-api-YOUR-PROJECT.a]run.app"
#   export CONNECTION_ID="your-connection-id"
#   bash scripts/test-error-paths.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SUPABASE_URL="${SUPABASE_URL:-https://zpswjccsxjtnhetkkqde.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"
API_URL="${API_URL:-}"
CONNECTION_ID="${CONNECTION_ID:-}"
# Admin email for getting a JWT
ADMIN_EMAIL="${ADMIN_EMAIL:-jmbarros@bgconsult.cl}"

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo -e "${RED}ERROR: SUPABASE_SERVICE_KEY not set${NC}"
  exit 1
fi

if [ -z "$API_URL" ]; then
  echo -e "${RED}ERROR: API_URL not set${NC}"
  exit 1
fi

if [ -z "$CONNECTION_ID" ]; then
  echo -e "${RED}ERROR: CONNECTION_ID not set${NC}"
  exit 1
fi

# ── Step 1: Get a JWT token via magic link ──
echo -e "${YELLOW}Getting JWT via magic link...${NC}"

MAGIC_LINK_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"magiclink\", \"email\": \"${ADMIN_EMAIL}\"}")

ACCESS_TOKEN=$(echo "$MAGIC_LINK_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}Failed to get access token. Response: ${MAGIC_LINK_RESPONSE}${NC}"
  exit 1
fi

echo -e "${GREEN}Got JWT token (${#ACCESS_TOKEN} chars)${NC}"

PASS=0
FAIL=0
TOTAL=0
CAMPAIGN_IDS=()

# ── Helper: run a test ──
run_test() {
  local name="$1"
  local payload="$2"
  local expected_field="$3"  # e.g. "adset_error" or "creative_error"
  TOTAL=$((TOTAL + 1))

  echo ""
  echo -e "${YELLOW}Test ${TOTAL}: ${name}${NC}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${API_URL}/api/manage-meta-campaign" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  # Extract campaign_id for cleanup
  CAMP_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('campaign_id',''))" 2>/dev/null || echo "")
  if [ -n "$CAMP_ID" ]; then
    CAMPAIGN_IDS+=("$CAMP_ID")
  fi

  SUCCESS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))" 2>/dev/null || echo "")
  PARTIAL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('partial',''))" 2>/dev/null || echo "")
  HAS_FIELD=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('${expected_field}') else 'no')" 2>/dev/null || echo "no")

  if [ "$HTTP_CODE" = "502" ] && [ "$SUCCESS" = "False" ] && [ "$HAS_FIELD" = "yes" ]; then
    echo -e "${GREEN}  PASS: HTTP ${HTTP_CODE}, success=${SUCCESS}, ${expected_field} present${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}  FAIL: HTTP ${HTTP_CODE}, success=${SUCCESS}, partial=${PARTIAL}, ${expected_field}=${HAS_FIELD}${NC}"
    echo -e "${RED}  Body: ${BODY}${NC}"
    FAIL=$((FAIL + 1))
  fi
}

# ── Test 1: Invalid targeting → adset fails ──
run_test "Invalid targeting → adset_error" \
  "{\"action\":\"create\",\"connection_id\":\"${CONNECTION_ID}\",\"data\":{\"name\":\"QA Error Test $(date +%s)\",\"objective\":\"OUTCOME_TRAFFIC\",\"status\":\"PAUSED\",\"daily_budget\":1000,\"targeting\":{\"geo_locations\":{\"countries\":[\"ZZZZZ\"]}},\"destination_url\":\"https://example.com\",\"primary_text\":\"Test\",\"headline\":\"Test\",\"image_url\":\"https://picsum.photos/1200/628\",\"page_id\":null}}" \
  "adset_error"

# ── Test 2: Broken image URL → creative_error (single format) ──
run_test "Broken image URL → creative_error" \
  "{\"action\":\"create\",\"connection_id\":\"${CONNECTION_ID}\",\"data\":{\"name\":\"QA Error Test Img $(date +%s)\",\"objective\":\"OUTCOME_TRAFFIC\",\"status\":\"PAUSED\",\"daily_budget\":1000,\"targeting\":{\"geo_locations\":{\"countries\":[\"CL\"]}},\"destination_url\":\"https://example.com\",\"primary_text\":\"Test\",\"headline\":\"Test\",\"image_url\":\"https://httpstat.us/404\",\"page_id\":null}}" \
  "creative_error"

# ── Test 3: Carousel with all broken images → creative_error ──
run_test "Carousel all broken images → creative_error" \
  "{\"action\":\"create\",\"connection_id\":\"${CONNECTION_ID}\",\"data\":{\"name\":\"QA Carousel Error $(date +%s)\",\"objective\":\"OUTCOME_TRAFFIC\",\"status\":\"PAUSED\",\"daily_budget\":1000,\"targeting\":{\"geo_locations\":{\"countries\":[\"CL\"]}},\"destination_url\":\"https://example.com\",\"ad_set_format\":\"carousel\",\"images\":[\"https://httpstat.us/404\",\"https://httpstat.us/404\",\"https://httpstat.us/404\"],\"texts\":[\"Test\"],\"headlines\":[\"Test\"]}}" \
  "creative_error"

# ── Cleanup: archive any test campaigns ──
echo ""
echo -e "${YELLOW}Cleaning up test campaigns...${NC}"
for cid in "${CAMPAIGN_IDS[@]}"; do
  if [ -n "$cid" ]; then
    echo -n "  Archiving ${cid}... "
    ARCHIVE_RESPONSE=$(curl -s -X POST \
      "${API_URL}/api/manage-meta-campaign" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"archive\",\"connection_id\":\"${CONNECTION_ID}\",\"campaign_id\":\"${cid}\"}")
    echo "done"
  fi
done

# ── Summary ──
echo ""
echo "============================================"
echo -e "Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC} / ${TOTAL} total"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
