# QA Report: Steve Mail — Run #2 (Regression)

| Field | Value |
|-------|-------|
| **Date** | 2026-03-17 |
| **URL** | https://www.steve.cl |
| **Run ID** | stevemail-r2 |
| **Bundle** | index-Dc07DTkJ.js (NEW) |
| **Key commit** | a58c67a — Steve Mail lists/segments panel + fix domain config button |
| **Duration** | ~10 min |
| **Screenshots** | 8 |

## Regression vs r1: 3 of 4 bugs addressed

| Bug from r1 | Status | Notes |
|-------------|--------|-------|
| BUG-001: No bloque Footer/Unsubscribe | **FIXED** | "Footer / Unsub" block added to sidebar |
| BUG-002: Email remitente placeholder | **OPEN** | Still shows "noreply@tudominio.com" |
| BUG-003: No listas ni segmentos | **PARTIAL** | UI created but DB table email_lists missing -> 500 |
| BUG-004: Config dominio no abre | **FIXED** | Modal opens with input + Verificar button |

## New findings

### New blocks: Video, HTML custom, Productos (multi), Columnas, Seccion
Total blocks: 16 (was 13 in r1)

## Bugs

### BUG-005 (CRITICAL): Table email_lists missing — Listas y Segmentos broken
- Toast: "Could not find the table public.email_lists in the schema cache"
- UI renders Listas(0) + Segmentos(0) + Crear button, but DB table doesn't exist
- Fix: create migration for email_lists table

### BUG-006 (MAJOR): Domain verification shows no DNS records
- Enter "jardindeeva.cl" -> Verificar -> Toast "Your plan includes 1 domain"
- But no DNS records shown (SPF, DKIM, DMARC), no verification status
- Modal stays same after verify

### BUG-002 (MAJOR): Email remitente still placeholder — OPEN
- Still shows "noreply@tudominio.com" instead of domain-based email

### Console: 2x 500 errors from domain/lists API calls

## Top 3 blockers remaining
1. Table email_lists missing — needs DB migration
2. Domain verification incomplete — needs DNS records display
3. Email remitente auto-fill from domain config

## Can we send the first email?
Almost. Editor ready (16 blocks + Footer/Unsub + 66 templates + AI gen). Missing: import contacts, fix email remitente, create email_lists table, complete domain verification.
