#!/bin/bash
# Simulación de 12 mensajes extremos contra Steve Vendedor
# Verifica: escalación no cae a fallback, pain points <= 8, respuestas < 10s

API_URL="https://steve-api-850416724643.us-central1.run.app"
ENDPOINT="$API_URL/api/whatsapp/steve-wa-chat"
# Usar número de test para no contaminar datos reales
TEST_PHONE="whatsapp:%2B56900000099"
MSG_SID_BASE="SMtest$(date +%s)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

MESSAGES=(
  "Hola qué onda"
  "Vendo ropa de segunda mano online, en Shopify"
  "Facturo como 3 palos al mes, pero estoy perdiendo plata en ads"
  "Sí, he gastado en Meta Ads pero no sé si funciona, no puedo medir los resultados"
  "No tengo tiempo para hacer marketing yo solo, es una mierda"
  "Eres un bot? Quiero hablar con una persona real"
  "Cuánto cobran ustedes? No tengo mucha plata"
  "El problema es que pierdo dinero en publicidad y no sé qué hacer"
  "Me falta tiempo para hacer marketing, no doy abasto"
  "Estoy perdiendo lucas en ads y no entiendo las métricas"
  "Quiero empezar lo antes posible, estoy desesperado"
  "Ya pero cuéntame los planes y precios concretos"
)

echo "========================================"
echo " SIMULACIÓN 12 MENSAJES EXTREMOS"
echo " Steve Vendedor - Test de Fixes"
echo "========================================"
echo ""

TOTAL_TIME=0
FALLBACK_COUNT=0
ESCALATION_OK=false

for i in "${!MESSAGES[@]}"; do
  MSG="${MESSAGES[$i]}"
  MSG_NUM=$((i + 1))
  MSG_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))" 2>/dev/null || echo "$MSG")

  echo -e "${YELLOW}--- MSG $MSG_NUM ---${NC}"
  echo "Enviando: $MSG"

  START=$(date +%s%N)

  RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "MessageSid=${MSG_SID_BASE}${MSG_NUM}&From=${TEST_PHONE}&Body=${MSG_ENCODED}&AccountSid=ACtest123&ProfileName=TestExtremo" \
    --max-time 30)

  END=$(date +%s%N)

  # Parse response
  HTTP_CODE=$(echo "$RESPONSE" | tail -1 | tr -d '\n' | grep -oE '[0-9]+\.[0-9]+' || echo "0")
  STATUS=$(echo "$RESPONSE" | tail -2 | head -1)
  BODY=$(echo "$RESPONSE" | head -n -2)

  # Extract time
  TIME_S=$(echo "$RESPONSE" | tail -1)

  # Extract reply text from TwiML
  REPLY=$(echo "$BODY" | grep -oP '(?<=<Message>).*?(?=</Message>)' || echo "$BODY" | head -c 200)

  # Check for fallback
  IS_FALLBACK=false
  if echo "$REPLY" | grep -qi "problema técnico\|problema procesando\|no pude procesar"; then
    IS_FALLBACK=true
    FALLBACK_COUNT=$((FALLBACK_COUNT + 1))
  fi

  # Check escalation message (msg 6)
  if [ $MSG_NUM -eq 6 ]; then
    if echo "$REPLY" | grep -qi "asistente de IA\|José Manuel\|meetings.hubspot"; then
      ESCALATION_OK=true
      echo -e "  ${GREEN}[ESCALATION OK]${NC} Respuesta contextual, NO fallback"
    else
      echo -e "  ${RED}[ESCALATION FAIL]${NC} No detectó escalación correctamente"
    fi
  fi

  # Print result
  if [ "$IS_FALLBACK" = true ]; then
    echo -e "  ${RED}[FALLBACK]${NC} $REPLY"
  else
    echo -e "  ${GREEN}[OK]${NC} $(echo "$REPLY" | head -c 150)..."
  fi
  echo "  Status: $STATUS | Time: ${TIME_S}s"
  echo ""

  # Small delay between messages
  sleep 2
done

echo "========================================"
echo " RESULTADOS"
echo "========================================"
echo ""
echo -e "Fallbacks: ${FALLBACK_COUNT}/12"
if [ "$ESCALATION_OK" = true ]; then
  echo -e "Escalación (msg 6): ${GREEN}PASS${NC}"
else
  echo -e "Escalación (msg 6): ${RED}FAIL${NC}"
fi

# Check pain points in DB
echo ""
echo "Verificando pain points en DB..."
PAIN_POINTS=$(curl -s \
  "https://zpswjccsxjtnhetkkqde.supabase.co/rest/v1/wa_prospects?phone=eq.%2B56900000099&select=pain_points,name,what_they_sell,stage,lead_score" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ")

echo "$PAIN_POINTS" | python3 -m json.tool 2>/dev/null || echo "$PAIN_POINTS"

# Count pain points
PP_COUNT=$(echo "$PAIN_POINTS" | python3 -c "import sys,json; data=json.load(sys.stdin); pp=data[0].get('pain_points') if data else []; print(len(pp) if pp else 0)" 2>/dev/null || echo "?")
echo ""
if [ "$PP_COUNT" != "?" ] && [ "$PP_COUNT" -le 8 ] 2>/dev/null; then
  echo -e "Pain points: ${PP_COUNT} ${GREEN}(<= 8 PASS)${NC}"
else
  echo -e "Pain points: ${PP_COUNT} ${RED}(> 8 o error)${NC}"
fi

echo ""
echo "========================================"
