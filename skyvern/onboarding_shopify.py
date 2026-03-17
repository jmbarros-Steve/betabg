"""
Onboarding Shopify — Crea custom app + extrae token via Skyvern API real.

Skyvern corre en localhost:8000. Usa la API REST:
  POST /v1/browser_sessions                     — crea sesion con browser persistente
  POST /v1/run/tasks                            — task con prompt + data_extraction_schema
  GET  /v1/runs/{run_id}                        — poll status
  GET  /v1/runs/{run_id}/artifacts              — obtener screenshots/datos extra
  POST /v1/browser_sessions/{id}/close          — cerrar sesion

Auth: header x-api-key en todas las llamadas.

Estrategia: Skyvern self-hosted no tiene Bitwarden configurado, asi que las
credenciales van en el prompt del task (SSL local, nunca salen de la VM).
El task hace login + crea app + extrae token en una sola corrida.

RESTRICCIONES INQUEBRANTABLES:
  - Credenciales NUNCA se loguean por este script (solo van en el prompt a Skyvern)
  - Max 2 reintentos de login
  - Merchant NUNCA ve un browser
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SKYVERN_URL = os.environ.get("SKYVERN_API_URL", "http://localhost:8000")
SKYVERN_API_KEY = os.environ.get("SKYVERN_API_KEY", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

TERMINAL_STATUSES = {"completed", "failed", "terminated", "timed_out", "canceled"}

SHOPIFY_SCOPES = [
    "read_products", "write_products",
    "read_orders", "write_orders",
    "read_analytics",
    "read_checkouts",
    "read_draft_orders", "write_draft_orders",
    "read_reports",
]


# ---------------------------------------------------------------------------
# Skyvern HTTP helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if SKYVERN_API_KEY:
        h["x-api-key"] = SKYVERN_API_KEY
    return h


async def skyvern_post(client: httpx.AsyncClient, path: str, body: dict) -> dict:
    resp = await client.post(f"{SKYVERN_URL}{path}", json=body, headers=_headers())
    if resp.status_code >= 400:
        print(f"  [skyvern] POST {path} -> {resp.status_code}: {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()


async def skyvern_get(client: httpx.AsyncClient, path: str) -> dict:
    resp = await client.get(f"{SKYVERN_URL}{path}", headers=_headers())
    resp.raise_for_status()
    return resp.json()


async def poll_run(client: httpx.AsyncClient, run_id: str, timeout: int = 300) -> dict:
    """Poll GET /v1/runs/{run_id} until terminal status."""
    elapsed = 0
    last_status = ""
    while elapsed < timeout:
        await asyncio.sleep(5)
        elapsed += 5
        run = await skyvern_get(client, f"/v1/runs/{run_id}")
        status = run.get("status", "")
        if status != last_status:
            steps = run.get("step_count", "?")
            print(f"  [{run_id[:12]}] status={status}  steps={steps}  ({elapsed}s)")
            last_status = status
        if status in TERMINAL_STATUSES:
            return run
    raise TimeoutError(f"Skyvern run {run_id} timed out after {timeout}s")


# ---------------------------------------------------------------------------
# Supabase helpers (optional — test mode if not configured)
# ---------------------------------------------------------------------------

def _get_supabase():
    if not SUPABASE_URL:
        return None
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


async def update_job(job_id: str, **fields):
    sb = _get_supabase()
    if sb and job_id != "test":
        sb.table("onboarding_jobs").update(fields).eq("id", job_id).execute()
    step = fields.get("shopify_step", "")
    if step:
        print(f"  [job] {step}")


async def save_shopify_token(client_id: str, shop_domain: str, token: str):
    sb = _get_supabase()
    if not sb:
        print(f"  [save] DRY-RUN — token OK ({len(token)} chars), not saving (no Supabase)")
        return

    enc_result = sb.rpc("encrypt_platform_token", {"raw_token": token}).execute()
    encrypted = enc_result.data

    existing = (
        sb.table("platform_connections")
        .select("id")
        .eq("client_id", client_id)
        .eq("platform", "shopify")
        .execute()
    )

    row = {
        "client_id": client_id,
        "platform": "shopify",
        "api_key_encrypted": encrypted,
        "status": "active",
        "connected_at": datetime.now(timezone.utc).isoformat(),
        "metadata": json.dumps({"shop_domain": shop_domain}),
    }

    if existing.data:
        sb.table("platform_connections").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        sb.table("platform_connections").insert(row).execute()

    print(f"  [save] Token guardado en platform_connections para {shop_domain}")


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------

def _extract_token(output) -> str | None:
    """Try every possible way to get shpat_ from Skyvern output."""
    if not output:
        return None

    if isinstance(output, dict):
        for key in ("admin_api_access_token", "token", "access_token"):
            val = output.get(key, "")
            if isinstance(val, str) and val.startswith("shpat_"):
                return val.strip()
        for val in output.values():
            result = _extract_token(val)
            if result:
                return result

    if isinstance(output, str):
        try:
            parsed = json.loads(output)
            return _extract_token(parsed)
        except (json.JSONDecodeError, TypeError):
            pass
        if "shpat_" in output:
            for part in output.replace('"', " ").replace("'", " ").replace(",", " ").split():
                if part.startswith("shpat_") and len(part) > 20:
                    return part.strip()

    if isinstance(output, list):
        for item in output:
            result = _extract_token(item)
            if result:
                return result

    return None


# ---------------------------------------------------------------------------
# Main onboarding flow
# ---------------------------------------------------------------------------

async def onboard_shopify(
    job_id: str,
    client_id: str,
    shop_domain: str,
    email: str,
    password: str,
):
    """
    Full Shopify onboarding via Skyvern API:
      1. Create browser session
      2. Single task: login + create app + scopes + install + extract token
      3. Save token to platform_connections
      4. Cleanup: close browser session
    """
    browser_session_id: str | None = None
    t0 = time.time()

    async with httpx.AsyncClient(timeout=90) as client:
        try:
            # ============================================
            # STEP 1: Create browser session
            # ============================================
            await update_job(job_id, shopify_status="running", shopify_step="Preparando browser...")

            session_resp = await skyvern_post(client, "/v1/browser_sessions", {
                "timeout": 360,
            })
            browser_session_id = session_resp.get("browser_session_id")
            print(f"  [browser] Session {browser_session_id}")

            # ============================================
            # STEP 2: Login + create app + extract token
            # ============================================
            await update_job(job_id, shopify_step="Conectando con Shopify...")

            scopes_csv = ", ".join(SHOPIFY_SCOPES)
            login_url = f"https://{shop_domain}/admin"

            # Build the mega-prompt: login + navigate + create app + scopes + install + extract
            prompt = f"""Go to {login_url} and complete ALL of these steps in order:

PHASE 1 — LOGIN:
1. You will see the Shopify login page. Enter this email: {email}
2. Enter this password: {password}
3. Click "Log in".
4. If there is a CAPTCHA, solve it.
5. If there is a "device confirmation" or extra verification step, complete it.
6. Wait until you see the Shopify admin dashboard.

PHASE 2 — NAVIGATE TO APP DEVELOPMENT:
7. Click "Settings" in the bottom-left sidebar menu.
8. Click "Apps and sales channels".
9. Look for and click "Develop apps" (may also say "Develop apps for your store").
10. IF you see a button "Allow custom app development", click it, then click "Allow custom app development" again in the confirmation dialog.

PHASE 3 — CREATE THE APP:
11. Click "Create an app" button.
12. In the "App name" input field, type: Steve Ads
13. Click "Create app" to confirm.

PHASE 4 — CONFIGURE API SCOPES:
14. Click "Configure Admin API scopes".
15. You will see a long list of API scope checkboxes. You need to check EACH of these scopes:
    {scopes_csv}
    - Use the search box at the top of the scopes section to search for each scope name
    - Make sure the checkbox next to each scope is CHECKED
16. After checking all scopes, scroll down and click "Save".

PHASE 5 — INSTALL:
17. Click the "Install app" button (usually near the top right).
18. A confirmation dialog will appear. Click "Install" to confirm.

PHASE 6 — EXTRACT TOKEN:
19. After installation, you will see the "Admin API access token" section.
20. IMPORTANT: If there is a "Reveal token once" link/button, you MUST click it.
21. The token is a long string starting with "shpat_".
22. Extract and return the COMPLETE token string.

CRITICAL NOTES:
- The Admin API access token is shown ONLY ONCE after installation. Do not navigate away before extracting it.
- If an app named "Steve Ads" already exists, click on it instead of creating a new one, go to API credentials, and extract the existing token.
- Do NOT modify or delete any existing apps or settings."""

            task_resp = await skyvern_post(client, "/v1/run/tasks", {
                "url": login_url,
                "prompt": prompt,
                "engine": "skyvern-2.0",
                "browser_session_id": browser_session_id,
                "max_steps": 60,
                "data_extraction_schema": {
                    "type": "object",
                    "properties": {
                        "admin_api_access_token": {
                            "type": "string",
                            "description": (
                                "The Shopify Admin API access token. "
                                "It starts with 'shpat_' and is a long alphanumeric string. "
                                "Extract the COMPLETE token without truncation."
                            ),
                        },
                    },
                },
            })

            run_id = task_resp.get("run_id")
            print(f"  [task] Run {run_id}")

            await update_job(job_id, shopify_step="Configurando Shopify (esto tarda ~60s)...")

            task_result = await poll_run(client, run_id, timeout=360)

            if task_result.get("status") != "completed":
                failure = task_result.get("failure_reason") or "unknown error"
                errors = task_result.get("errors") or []
                error_detail = f"{failure}"
                if errors:
                    error_detail += f" | errors: {json.dumps(errors)[:200]}"
                raise Exception(f"Task fallo: {error_detail}")

            # ============================================
            # STEP 3: Extract token from output
            # ============================================
            await update_job(job_id, shopify_step="Extrayendo token...")

            output = task_result.get("output")
            print(f"  [output] type={type(output).__name__} raw={str(output)[:200]}")

            token = _extract_token(output)

            if not token:
                raise Exception(
                    "No se pudo extraer el token (shpat_). "
                    "Shopify lo muestra solo UNA VEZ despues de instalar. "
                    f"Output: {str(output)[:300]}"
                )

            token = token.strip().strip("'\"")
            elapsed = time.time() - t0
            print(f"  [token] {token[:12]}...{token[-4:]} ({len(token)} chars) en {elapsed:.0f}s")

            # ============================================
            # STEP 4: Save token
            # ============================================
            await update_job(job_id, shopify_step="Guardando conexion...")
            await save_shopify_token(client_id, shop_domain, token)

            await update_job(
                job_id,
                shopify_status="completed",
                shopify_step="Conectado",
            )
            print(f"\n[onboarding-shopify] OK — {shop_domain} en {time.time() - t0:.0f}s")

        except Exception as e:
            error_msg = str(e)[:200]
            await update_job(
                job_id,
                shopify_status="failed",
                shopify_step=f"Error: {error_msg}",
            )
            print(f"\n[onboarding-shopify] FAIL — {error_msg}")
            raise

        finally:
            # Close browser session
            if browser_session_id:
                try:
                    await skyvern_post(
                        client,
                        f"/v1/browser_sessions/{browser_session_id}/close",
                        {},
                    )
                    print(f"  [cleanup] Browser session {browser_session_id} closed")
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

async def main():
    """
    Usage:
      python onboarding_shopify.py <shop_domain> <email> <password> [job_id] [client_id]

    Test mode (no job_id): prints results, no DB writes.

    Required env:
      SKYVERN_API_KEY  — from Skyvern self-hosted (run POST /api/v1/internal/auth/repair to get it)

    Optional env:
      SKYVERN_API_URL             — default http://localhost:8000
      SUPABASE_URL                — if set, saves token to DB
      SUPABASE_SERVICE_ROLE_KEY   — required if SUPABASE_URL is set
    """
    if len(sys.argv) < 4:
        print("Usage: python onboarding_shopify.py <shop_domain> <email> <password> [job_id] [client_id]")
        print()
        print("Example:")
        print("  export SKYVERN_API_KEY='ey...'")
        print("  python onboarding_shopify.py raicesdelalma.myshopify.com user@email.com 'password'")
        sys.exit(1)

    shop_domain = sys.argv[1]
    email = sys.argv[2]
    password = sys.argv[3]
    job_id = sys.argv[4] if len(sys.argv) > 4 else "test"
    client_id = sys.argv[5] if len(sys.argv) > 5 else "test"

    if not SKYVERN_API_KEY:
        print("ERROR: SKYVERN_API_KEY not set.")
        print("Get it with: curl -X POST http://localhost:8000/api/v1/internal/auth/repair")
        sys.exit(1)

    print(f"[onboarding-shopify] shop={shop_domain}")
    print(f"  Skyvern: {SKYVERN_URL}")
    print(f"  DB: {'configured' if SUPABASE_URL else 'test mode (no DB)'}")
    print()

    await onboard_shopify(job_id, client_id, shop_domain, email, password)


if __name__ == "__main__":
    asyncio.run(main())
