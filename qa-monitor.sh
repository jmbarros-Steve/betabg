#!/bin/bash
# QA Monitor — Playwright tests + multi-device + visual review con Claude Vision

cd ~/steve
mkdir -p logs/qa/screenshots

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
  LOGFILE="logs/qa/qa-${TIMESTAMP}.log"

  # ══════════════════════════════════════════════
  # STEP 1: Run standard Playwright tests
  # ══════════════════════════════════════════════
  echo "[${TIMESTAMP}] Corriendo tests estándar..."
  npx playwright test --reporter=line > "$LOGFILE" 2>&1
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Tests estándar OK"
    rm -f "$LOGFILE"
  else
    FAILED=$(grep -E "failed|FAILED|✘|×" "$LOGFILE" | head -5)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Tests estándar fallaron — log: $LOGFILE"
    openclaw message send "🚨 QA ALERT — Tests fallaron a las $(date '+%H:%M %d/%m')

${FAILED}

Log: ${LOGFILE}" 2>/dev/null
  fi

  # ══════════════════════════════════════════════
  # STEP 2: Multi-device tests
  # ══════════════════════════════════════════════
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📱 Corriendo tests multi-device..."
  DEVICE_LOG="logs/qa/multidevice-${TIMESTAMP}.log"
  npx playwright test e2e/qa-multidevice.spec.ts --config playwright-qa.config.ts --reporter=line > "$DEVICE_LOG" 2>&1
  DEVICE_EXIT=$?

  if [ $DEVICE_EXIT -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Multi-device OK"
    rm -f "$DEVICE_LOG"
  else
    # Parse which device failed
    DEVICE_FAILS=$(grep -E "✘|×|failed|FAILED" "$DEVICE_LOG" | head -10)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Multi-device falló"
    openclaw message send "📱 DEVICE QA — Tests fallaron en algunos dispositivos a las $(date '+%H:%M %d/%m')

${DEVICE_FAILS}

Log: ${DEVICE_LOG}" 2>/dev/null
  fi

  # ══════════════════════════════════════════════
  # STEP 3: Screenshots + Claude Vision review
  # ══════════════════════════════════════════════
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📸 Sacando screenshots..."
  npx playwright test e2e/qa-screenshots.spec.ts --config playwright-qa.config.ts > /dev/null 2>&1

  if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  ANTHROPIC_API_KEY no configurada. Saltando visual review."
  else
    PROMPT="Mira esta screenshot de mi portal SaaS de marketing. Evalúa del 1 al 10:\n- Se ve profesional?\n- Hay algo desalineado o cortado?\n- Los espacios son consistentes?\n- La jerarquía visual es clara?\n- Se ve como un producto de \$79/mes o como algo gratis?\nSi algo está mal, dime EXACTAMENTE qué y dónde.\n\nResponde en formato:\nPROFESIONAL: X/10\nALINEACION: X/10\nESPACIOS: X/10\nJERARQUIA: X/10\nVALOR: X/10\nCOMENTARIO: ..."

    for IMG in logs/qa/screenshots/*.png; do
      [ -f "$IMG" ] || continue
      PAGE_NAME=$(basename "$IMG" .png)
      echo "  Revisando $PAGE_NAME..."

      B64=$(base64 -w 0 "$IMG")

      RESPONSE=$(curl -s https://api.anthropic.com/v1/messages \
        -H "x-api-key: ${ANTHROPIC_API_KEY}" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d "{
          \"model\": \"claude-haiku-4-5-20241022\",
          \"max_tokens\": 1024,
          \"messages\": [{
            \"role\": \"user\",
            \"content\": [
              {\"type\": \"image\", \"source\": {\"type\": \"base64\", \"media_type\": \"image/png\", \"data\": \"${B64}\"}},
              {\"type\": \"text\", \"text\": \"$(echo -e "$PROMPT")\"}
            ]
          }]
        }" 2>/dev/null)

      REVIEW=$(echo "$RESPONSE" | jq -r '.content[0].text // "Error getting review"')

      # Check for any score below 7
      LOW_SCORES=$(echo "$REVIEW" | grep -oE '[0-9]+/10' | while read score; do
        NUM=$(echo "$score" | cut -d/ -f1)
        if [ "$NUM" -lt 7 ] 2>/dev/null; then
          echo "$score"
        fi
      done)

      if [ -n "$LOW_SCORES" ]; then
        echo "  ⚠️  $PAGE_NAME tiene scores bajos: $LOW_SCORES"
        openclaw message send "👁️ VISUAL QA — Página '$PAGE_NAME' tiene problemas:

${REVIEW}

Scores bajos: ${LOW_SCORES}" 2>/dev/null
      else
        echo "  ✅ $PAGE_NAME OK"
      fi

      echo "=== $PAGE_NAME === $(date)" >> "logs/qa/visual-review-${TIMESTAMP}.log"
      echo "$REVIEW" >> "logs/qa/visual-review-${TIMESTAMP}.log"
      echo "" >> "logs/qa/visual-review-${TIMESTAMP}.log"
    done
  fi

  echo "Próximo check en 15 minutos..."
  sleep 900
done
