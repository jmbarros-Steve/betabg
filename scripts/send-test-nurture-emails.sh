#!/bin/bash
# Send 3 test nurture emails for Steve Perro Lobo
set -e

ANTHROPIC_KEY=$(gcloud secrets versions access latest --secret=ANTHROPIC_API_KEY --project=steveapp-agency)
RESEND_KEY=$(gcloud secrets versions access latest --secret=RESEND_API_KEY --project=steveapp-agency)
TO_EMAIL="jmbarros@bgconsult.cl"

echo "Keys loaded. Sending emails to $TO_EMAIL..."

# --- Helper: call Haiku and extract JSON ---
call_haiku() {
  local prompt="$1"
  curl -s https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$(jq -n --arg p "$prompt" '{model:"claude-haiku-4-5-20251001",max_tokens:1000,messages:[{role:"user",content:$p}]}')"
}

send_resend() {
  local subject="$1"
  local html="$2"
  curl -s -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg from "Steve de BG Consult <steve@bgconsult.cl>" --arg to "$TO_EMAIL" --arg subj "$subject" --arg html "$html" '{from:$from,to:$to,subject:$subj,html:$html}')"
}

# ============================================================
# EMAIL 1
# ============================================================
echo ""
echo "--- Generating Email 1/3: Resumen conversación ---"
E1_RAW=$(call_haiku "Genera un email de nurture para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

Es el primer email después de una conversación por WhatsApp donde hablamos de:
- Tiene tienda online en Shopify (arueda.cl)
- Vende equipamiento deportivo y outdoor
- Factura aprox 5 millones mensuales
- Usa Meta Ads pero no ve bien los resultados
- Le interesa optimizar su marketing digital

INSTRUCCIONES:
- Asunto: Algo personal referenciando lo conversado (max 60 chars)
- Cuerpo: Resumen breve de lo conversado + 1 insight relevante de la industria deportiva en Chile
- Tono: Profesional, cercano, como un colega que sabe de marketing
- Formato: HTML con diseño limpio. Párrafos cortos, negritas para lo importante.
- Firma: Steve de BG Consult
- Largo: 150-250 palabras max

Responde SOLO con JSON válido sin markdown fences: {\"subject\":\"asunto\",\"html\":\"contenido html\"}")

E1_SUBJECT=$(echo "$E1_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.subject')
E1_HTML=$(echo "$E1_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.html')

echo "  Subject: $E1_SUBJECT"
R1=$(send_resend "[PRUEBA 1/3] $E1_SUBJECT" "$E1_HTML")
echo "  Result: $R1"

sleep 2

# ============================================================
# EMAIL 2
# ============================================================
echo ""
echo "--- Generating Email 2/3: Caso de éxito ---"
E2_RAW=$(call_haiku "Genera un email de nurture (paso 2 de 3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

INSTRUCCIONES:
- Asunto: Caso de éxito en la industria deportiva (max 60 chars)
- Cuerpo: Un caso de éxito creíble de una marca deportiva/outdoor en Chile o LATAM que mejoró resultados con marketing AI y optimización de campañas. Incluye números concretos (porcentaje mejora, ROAS, revenue growth).
- Tono: Informativo, con datos, sin ser vendedor agresivo
- Formato: HTML con diseño limpio. Párrafos cortos, negritas y bullets.
- Firma: Steve de BG Consult
- Largo: 150-250 palabras max

Responde SOLO con JSON válido sin markdown fences: {\"subject\":\"asunto\",\"html\":\"contenido html\"}")

E2_SUBJECT=$(echo "$E2_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.subject')
E2_HTML=$(echo "$E2_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.html')

echo "  Subject: $E2_SUBJECT"
R2=$(send_resend "[PRUEBA 2/3] $E2_SUBJECT" "$E2_HTML")
echo "  Result: $R2"

sleep 2

# ============================================================
# EMAIL 3
# ============================================================
echo ""
echo "--- Generating Email 3/3: Preparé algo para tu marca ---"
E3_RAW=$(call_haiku "Genera un email de nurture FINAL (paso 3 de 3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

INSTRUCCIONES:
- Asunto: Preparé algo para Arueda o similar (max 60 chars)
- Cuerpo: Dile que preparaste un análisis personalizado de su tienda arueda.cl y sus campañas, y que te gustaría mostrárselo en una llamada corta de 15 min. Menciona algo específico que podrías mejorar (ej: estructura de campañas Meta, segmentación de audiencias deportivas). Incluye CTA con link: https://meetings.hubspot.com/jose-manuel15
- Tono: Personal, como si realmente hubieras trabajado en algo para él. Urgencia suave.
- Formato: HTML con diseño limpio. Botón o link destacado para agendar.
- Firma: Steve de BG Consult
- Largo: 100-150 palabras max

Responde SOLO con JSON válido sin markdown fences: {\"subject\":\"asunto\",\"html\":\"contenido html\"}")

E3_SUBJECT=$(echo "$E3_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.subject')
E3_HTML=$(echo "$E3_RAW" | jq -r '.content[0].text' | sed 's/```json//;s/```//' | jq -r '.html')

echo "  Subject: $E3_SUBJECT"
R3=$(send_resend "[PRUEBA 3/3] $E3_SUBJECT" "$E3_HTML")
echo "  Result: $R3"

echo ""
echo "✅ Los 3 emails fueron enviados a $TO_EMAIL"
