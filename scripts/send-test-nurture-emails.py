#!/usr/bin/env python3
"""Send 3 test nurture emails for Steve Perro Lobo."""
import json, subprocess, sys, time

def get_secret(name):
    result = subprocess.run(
        ['gcloud', 'secrets', 'versions', 'access', 'latest',
         f'--secret={name}', '--project=steveapp-agency'],
        capture_output=True, text=True
    )
    return result.stdout.strip()

ANTHROPIC_KEY = get_secret('ANTHROPIC_API_KEY')
RESEND_KEY = get_secret('RESEND_API_KEY')
TO_EMAIL = 'jmbarros@bgconsult.cl'

print(f"Keys loaded: ANTHROPIC={len(ANTHROPIC_KEY)} chars, RESEND={len(RESEND_KEY)} chars")

import urllib.request

def call_haiku(prompt):
    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=json.dumps({
            'model': 'claude-haiku-4-5-20251001',
            'max_tokens': 1000,
            'messages': [{'role': 'user', 'content': prompt}],
        }).encode(),
        headers={
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        }
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    text = data['content'][0]['text'].strip()
    # Remove markdown fences
    text = text.replace('```json', '').replace('```', '').strip()
    return json.loads(text)

def send_email(subject, html):
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps({
            'from': 'Steve de BG Consult <steve@bgconsult.cl>',
            'to': TO_EMAIL,
            'subject': subject,
            'html': html,
        }).encode(),
        headers={
            'Authorization': f'Bearer {RESEND_KEY}',
            'Content-Type': 'application/json',
        }
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# ============================================================
# EMAIL 1: Resumen conversación + insight industria deporte
# ============================================================
print("\n--- Generating Email 1/3 ---")
e1 = call_haiku("""Genera un email de nurture para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

Es el primer email después de una conversación por WhatsApp donde hablamos de:
- Tiene tienda online en Shopify (arueda.cl)
- Vende equipamiento deportivo y outdoor
- Factura aprox $5M mensuales
- Usa Meta Ads pero no ve bien los resultados
- Le interesa optimizar su marketing digital

INSTRUCCIONES:
- Asunto: Algo personal referenciando lo conversado (max 60 chars)
- Cuerpo: Resumen breve de lo conversado + 1 insight relevante de la industria deportiva en Chile
- Tono: Profesional, cercano, como un colega que sabe de marketing
- Formato: HTML con diseño limpio. Usa párrafos cortos, negritas para lo importante.
- Firma: "Steve 🐕 — BG Consult"
- Largo: 150-250 palabras max

Responde SOLO con JSON válido: {"subject":"asunto","html":"<contenido html>"}""")

print(f"  Subject: {e1['subject']}")
r1 = send_email(f"[PRUEBA 1/3] {e1['subject']}", e1['html'])
print(f"  Sent! {r1}")

time.sleep(2)

# ============================================================
# EMAIL 2: Caso de éxito industria deporte con números
# ============================================================
print("\n--- Generating Email 2/3 ---")
e2 = call_haiku("""Genera un email de nurture (paso 2/3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

INSTRUCCIONES:
- Asunto: Caso de éxito en la industria deportiva (max 60 chars)
- Cuerpo: Un caso de éxito creíble de una marca deportiva/outdoor en Chile o LATAM que mejoró resultados con marketing AI y optimización de campañas. Incluye números concretos (% mejora, ROAS, revenue growth).
- Tono: Informativo, con datos, sin ser vendedor agresivo
- Formato: HTML con diseño limpio. Usa párrafos cortos, negritas y bullets.
- Firma: "Steve 🐕 — BG Consult"
- Largo: 150-250 palabras max

Responde SOLO con JSON válido: {"subject":"asunto","html":"<contenido html>"}""")

print(f"  Subject: {e2['subject']}")
r2 = send_email(f"[PRUEBA 2/3] {e2['subject']}", e2['html'])
print(f"  Sent! {r2}")

time.sleep(2)

# ============================================================
# EMAIL 3: "Preparé algo para tu marca" + link reunión
# ============================================================
print("\n--- Generating Email 3/3 ---")
e3 = call_haiku("""Genera un email de nurture FINAL (paso 3/3) para José Manuel de Arueda (www.arueda.cl) que vende productos deportivos/outdoor.

INSTRUCCIONES:
- Asunto: "Preparé algo para Arueda" o similar (max 60 chars)
- Cuerpo: Dile que preparaste un análisis personalizado de su tienda arueda.cl y sus campañas, y que te gustaría mostrárselo en una llamada corta de 15 min. Menciona algo específico que podrías mejorar (ej: estructura de campañas Meta, segmentación de audiencias deportivas). Incluye CTA con link: https://meetings.hubspot.com/jose-manuel15
- Tono: Personal, como si realmente hubieras trabajado en algo para él. Urgencia suave.
- Formato: HTML con diseño limpio. Botón/link destacado para agendar.
- Firma: "Steve 🐕 — BG Consult"
- Largo: 100-150 palabras max

Responde SOLO con JSON válido: {"subject":"asunto","html":"<contenido html>"}""")

print(f"  Subject: {e3['subject']}")
r3 = send_email(f"[PRUEBA 3/3] {e3['subject']}", e3['html'])
print(f"  Sent! {r3}")

print("\n✅ Los 3 emails fueron enviados a", TO_EMAIL)
