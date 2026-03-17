# MISIÓN: Editor de Emails — Diagnóstico FASE 0

Eres Valentina W1. Tu trabajo es hacer un DIAGNÓSTICO COMPLETO del editor de emails ANTES de tocar código.

## INSTRUCCIONES
cd ~/steve && git pull

## PUNTOS A EVALUAR:
1. ¿Qué librería usa el editor? (grapesjs, unlayer, react-email-editor, custom)
2. Screenshot actual 1280px + 375px (guarda en e2e/screenshots/editor-diagnostico-*)
3. Flujo completo de punta a punta:
   - Crear email arrastrando bloques → ¿funciona?
   - Agregar producto Shopify → ¿funciona?
   - Editar colores/fonts/spacing → ¿funciona?
   - Preview desktop + mobile → ¿funciona?
   - Test email → ¿llega? ¿se ve bien?
4. Lista de archivos del editor (rutas completas)
5. Cada punto: FUNCIONA / NO FUNCIONA / FUNCIONA MAL + detalle

## ENTREGA
Crea el archivo ~/steve/prompts/active/diagnostico-editor-v1.md con TODOS los resultados.
NO toques código aún. Solo diagnostica.
TIEMPO: 2 horas máximo.

## ARCHIVOS A REVISAR:
- src/components/client-portal/email/ (todo el directorio)
- src/components/email-editor/ (si existe)
- Busca con: grep -r "grapesjs\|GrapeJS\|unlayer\|BlocksEditor" src/
