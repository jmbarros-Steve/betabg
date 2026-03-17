"""
Onboarding Shopify — Crea custom app + extrae token via Skyvern API real.

Skyvern corre en localhost:8000. Usa la API REST:
  POST /v1/credentials          — guarda creds de forma segura
  POST /v1/browser_sessions     — crea sesion persistente
  POST /v1/run/tasks/login      — login con credential_id
  POST /v1/run/tasks            — task de navegacion (crear app, scopes, token)
  POST /v1/credentials/totp     — push 2FA code al task activo
  GET  /v1/runs/{run_id}        — poll status
  POST /v1/credentials/{id}/delete — borrar creds despues de usar

Flujo:
  1. Guardar credenciales en Skyvern (temporal)
  2. Crear browser session
  3. Login en Shopify Admin via /v1/run/tasks/login
  4. Task: navegar a Settings > Apps > Develop apps > Create app > Scopes > Install > Extract token
  5. Guardar token en platform_connections (encriptado)
  6. Borrar credenciales de Skyvern
  7. Trigger sync de productos

RESTRICCIONES INQUEBRANTABLES:
  - Credenciales se borran de Skyvern al terminar (exito o error)
  - NUNCA se loguean (print, sentry, screenshots)
  - Max 2 reintentos de login
  - Merchant NUNCA ve un browser
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

import httpx
from supabase import create_client

SKYVERN_URL = os.environ.get("SKYVERN_API_URL", "http://localhost:8000")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Steve API (Cloud Run) for triggering syncs
STEVE_API_URL = os.environ.get("STEVE_API_URL", "https://steve-api-1011041513672.us-central1.run.app")

TERMINAL_STATUSES = {"completed", "failed", "terminated", "timed_out", "canceled"}

SHOPIFY_SCOPES = [
    "read_products", "write_products",
    "read_orders", "write_orders",
    "read_analytics",
    "read_checkouts",
    "read_draft_orders", "write_draft_orders",
    "read_reports",
]


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ---------------------------------------------------------------------------
# Job status helpers (DB updates for frontend polling)
# ---------------------------------------------------------------------------

async def update_job(job_id: str, **fields):
    sb = get_supabase()
    sb.table("onboarding_jobs").update(fields).eq("id", job_id).execute()


async def set_pending_2fa(job_id: str):
    """Signal frontend that 2FA code is needed."""
    sb = get_supabase()
    sb.table("onboarding_jobs").update({
        "shopify_step": "Esperando codigo de verificacion...",
        "pending_input": json.dumps({"type": "2fa", "platform": "shopify"}),
    }).eq("id", job_id).execute()


async def wait_for_merchant_input(job_id: str, timeout_seconds: int = 300) -> str:
    """Poll DB until merchant submits 2FA code via frontend."""
    sb = get_supabase()
    elapsed = 0
    while elapsed < timeout_seconds:
        result = sb.table("onboarding_jobs").select("merchant_input").eq("id", job_id).single().execute()
        value = result.data.get("merchant_input") if result.data else None
        if value:
            sb.table("onboarding_jobs").update({
                "merchant_input": None,
                "pending_input": None,
            }).eq("id", job_id).execute()
            return value
        await asyncio.sleep(2)
        elapsed += 2
    raise TimeoutError(f"Merchant no respondio en {timeout_seconds}s")


# ---------------------------------------------------------------------------
# Skyvern API helpers
# ---------------------------------------------------------------------------

async def skyvern_post(client: httpx.AsyncClient, path: str, body: dict) -> dict:
    resp = await client.post(f"{SKYVERN_URL}{path}", json=body)
    resp.raise_for_status()
    return resp.json()


async def skyvern_get(client: httpx.AsyncClient, path: str) -> dict:
    resp = await client.get(f"{SKYVERN_URL}{path}")
    resp.raise_for_status()
    return resp.json()


async def skyvern_delete(client: httpx.AsyncClient, path: str) -> None:
    resp = await client.post(f"{SKYVERN_URL}{path}")
    # Don't raise — best effort cleanup


async def poll_run(client: httpx.AsyncClient, run_id: str, timeout: int = 180) -> dict:
    """Poll a Skyvern run until terminal status."""
    elapsed = 0
    while elapsed < timeout:
        await asyncio.sleep(3)
        elapsed += 3
        run = await skyvern_get(client, f"/v1/runs/{run_id}")
        if run.get("status") in TERMINAL_STATUSES:
            return run
    raise TimeoutError(f"Skyvern run {run_id} no termino en {timeout}s")


# ---------------------------------------------------------------------------
# Token storage
# ---------------------------------------------------------------------------

async def save_shopify_token(client_id: str, shop_domain: str, token: str):
    """Encrypt and store Shopify token in platform_connections."""
    sb = get_supabase()

    # Encrypt via DB function
    enc_result = sb.rpc("encrypt_platform_token", {"raw_token": token}).execute()
    encrypted = enc_result.data

    # Upsert connection
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


async def trigger_shopify_sync(client_id: str, shop_domain: str):
    """Trigger initial product/order sync via Steve API."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{STEVE_API_URL}/api/sync-shopify-metrics",
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"client_id": client_id, "shop_domain": shop_domain},
            )
    except Exception:
        pass  # Sync will happen on next cron cycle


# ---------------------------------------------------------------------------
# Main Shopify onboarding flow
# ---------------------------------------------------------------------------

async def onboard_shopify(
    job_id: str,
    client_id: str,
    shop_domain: str,
    email: str,
    password: str,
):
    """
    Full Shopify onboarding:
      1. Store creds in Skyvern
      2. Create browser session
      3. Login
      4. Navigate: Settings > Apps > Develop apps > Create "Steve Ads" > Scopes > Install
      5. Extract shpat_ token
      6. Save to platform_connections
      7. Cleanup creds from Skyvern
    """
    credential_id: str | None = None
    browser_session_id: str | None = None

    async with httpx.AsyncClient(timeout=60) as client:
        try:
            # ----- Step 1: Store credentials in Skyvern (temporary) -----
            await update_job(job_id, shopify_status="running", shopify_step="Preparando...")
            cred_resp = await skyvern_post(client, "/v1/credentials", {
                "name": f"shopify-onboard-{job_id[:8]}",
                "credential_type": "password",
                "credential": {
                    "username": email,
                    "password": password,
                },
            })
            credential_id = cred_resp.get("credential_id") or cred_resp.get("id")

            # ----- Step 2: Create browser session -----
            session_resp = await skyvern_post(client, "/v1/browser_sessions", {
                "timeout": 300,
            })
            browser_session_id = session_resp.get("browser_session_id") or session_resp.get("id")

            # ----- Step 3: Login to Shopify Admin -----
            await update_job(job_id, shopify_step="Iniciando sesion en Shopify...")
            login_url = f"https://{shop_domain}/admin"

            login_resp = await skyvern_post(client, "/v1/run/tasks/login", {
                "url": login_url,
                "credential_id": credential_id,
                "credential_type": "credential_id",
                "browser_session_id": browser_session_id,
                "totp_identifier": f"shopify-2fa-{job_id[:8]}",
                "prompt": (
                    "Log in to the Shopify admin panel. "
                    "Fill the email field and password field, then click the Log In button. "
                    "If a verification code / 2FA input appears, wait for the code to be provided."
                ),
            })
            login_run_id = login_resp.get("run_id")

            # Poll login — check if it needs 2FA
            login_result = None
            login_elapsed = 0
            while login_elapsed < 120:
                await asyncio.sleep(3)
                login_elapsed += 3
                login_result = await skyvern_get(client, f"/v1/runs/{login_run_id}")
                status = login_result.get("status", "")

                if status in TERMINAL_STATUSES:
                    break

                # If still running, check if it's stuck on 2FA
                # Skyvern will signal via failure_reason or keep running waiting for TOTP
                if status == "running" and login_elapsed > 20:
                    # After 20s of running, assume 2FA is needed — ask merchant
                    await set_pending_2fa(job_id)
                    code = await wait_for_merchant_input(job_id, timeout_seconds=180)

                    # Push 2FA code to Skyvern
                    await skyvern_post(client, "/v1/credentials/totp", {
                        "totp_identifier": f"shopify-2fa-{job_id[:8]}",
                        "content": code,
                    })
                    await update_job(job_id, shopify_step="Verificando codigo...")

                    # Continue polling
                    login_result = await poll_run(client, login_run_id, timeout=60)
                    break

            if not login_result or login_result.get("status") != "completed":
                failure = login_result.get("failure_reason", "Login fallo") if login_result else "Timeout"
                raise Exception(f"Login Shopify fallo: {failure}")

            # ----- Step 4: Create custom app + configure scopes + install -----
            await update_job(job_id, shopify_step="Creando app Steve Ads...")

            scopes_list = ", ".join(SHOPIFY_SCOPES)
            nav_prompt = f"""You are logged into the Shopify admin at {login_url}.

Navigate step by step:

1. Click "Settings" in the bottom-left sidebar.
2. Click "Apps and sales channels".
3. Click "Develop apps" (or "Develop apps for your store").
4. If you see a button "Allow custom app development", click it and confirm in the dialog.
5. Click "Create an app" (or "Create a custom app").
6. In the app name field, type "Steve Ads". Click "Create app".
7. Click "Configure Admin API scopes".
8. In the scopes list, search for and check EACH of these scopes: {scopes_list}
   For each scope, find it in the list and check its checkbox.
9. Click "Save" to save the scopes.
10. Click "Install app" (the button at the top).
11. In the confirmation dialog, click "Install".
12. You should now see the Admin API access token. It starts with "shpat_".
    If there is a "Reveal token once" button, click it to reveal the token.

IMPORTANT: After install, the token is shown ONLY ONCE. Make sure to extract it."""

            extraction_schema = {
                "type": "object",
                "properties": {
                    "admin_api_access_token": {
                        "type": "string",
                        "description": "The Shopify Admin API access token, starts with 'shpat_'",
                    },
                },
            }

            task_resp = await skyvern_post(client, "/v1/run/tasks", {
                "url": login_url,
                "prompt": nav_prompt,
                "engine": "skyvern-2.0",
                "browser_session_id": browser_session_id,
                "data_extraction_schema": extraction_schema,
                "max_steps": 40,
                "error_code_mapping": {
                    "SCOPE_NOT_FOUND": "Could not find the scope checkbox",
                    "APP_ALREADY_EXISTS": "An app named Steve Ads already exists",
                },
            })
            task_run_id = task_resp.get("run_id")

            await update_job(job_id, shopify_step="Configurando permisos de la app...")

            task_result = await poll_run(client, task_run_id, timeout=180)

            if task_result.get("status") != "completed":
                failure = task_result.get("failure_reason", "Task fallo")

                # If app already exists, try to just get the token
                if "APP_ALREADY_EXISTS" in str(failure):
                    await update_job(job_id, shopify_step="App ya existe, buscando token...")
                    retry_resp = await skyvern_post(client, "/v1/run/tasks", {
                        "url": login_url,
                        "prompt": (
                            "Navigate to Settings > Apps and sales channels > Develop apps. "
                            "Click on the app named 'Steve Ads'. "
                            "Go to the API credentials tab. "
                            "If the Admin API access token is visible, extract it. "
                            "If you see 'Reveal token once', click it."
                        ),
                        "engine": "skyvern-2.0",
                        "browser_session_id": browser_session_id,
                        "data_extraction_schema": extraction_schema,
                        "max_steps": 15,
                    })
                    task_result = await poll_run(client, retry_resp["run_id"], timeout=90)
                    if task_result.get("status") != "completed":
                        raise Exception(f"No se pudo extraer token de app existente: {task_result.get('failure_reason')}")
                else:
                    raise Exception(f"Creacion de app fallo: {failure}")

            # ----- Step 5: Extract token from output -----
            await update_job(job_id, shopify_step="Extrayendo token...")
            output = task_result.get("output", {})
            token = None

            if isinstance(output, dict):
                token = output.get("admin_api_access_token")
            if not token and isinstance(output, str):
                # Try to parse JSON from output
                try:
                    parsed = json.loads(output)
                    token = parsed.get("admin_api_access_token")
                except (json.JSONDecodeError, TypeError):
                    pass
            if not token and isinstance(output, str) and "shpat_" in output:
                # Brute force extract
                for part in output.replace('"', " ").replace("'", " ").split():
                    if part.startswith("shpat_"):
                        token = part
                        break

            if not token or "shpat_" not in token:
                raise Exception(
                    "No se pudo extraer el token de Shopify (shpat_). "
                    "El token solo se muestra una vez despues de instalar la app."
                )

            # Clean token (remove quotes, whitespace)
            token = token.strip().strip("'\"")

            # ----- Step 6: Save token -----
            await update_job(job_id, shopify_step="Guardando conexion...")
            await save_shopify_token(client_id, shop_domain, token)

            # ----- Step 7: Trigger sync -----
            await update_job(job_id, shopify_step="Sincronizando productos...")
            await trigger_shopify_sync(client_id, shop_domain)

            await update_job(
                job_id,
                shopify_status="completed",
                shopify_step="Conectado",
            )
            print(f"[onboarding-shopify] OK — client={client_id}, shop={shop_domain}")

        except Exception as e:
            error_msg = str(e)[:150]
            await update_job(
                job_id,
                shopify_status="failed",
                shopify_step=f"Error: {error_msg}",
            )
            print(f"[onboarding-shopify] FAIL — client={client_id}: {error_msg}")
            raise

        finally:
            # RESTRICCION #1: Borrar credenciales de Skyvern — SIEMPRE
            if credential_id:
                try:
                    await skyvern_delete(client, f"/v1/credentials/{credential_id}/delete")
                except Exception:
                    pass

            # Close browser session
            if browser_session_id:
                try:
                    await skyvern_post(client, f"/v1/browser_sessions/{browser_session_id}/close", {})
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# CLI entry point (for testing / cron / manual)
# ---------------------------------------------------------------------------

async def main():
    """
    Usage:
      python onboarding_shopify.py <job_id> <client_id> <shop_domain> <email> <password>

    In production, called by the onboarding orchestrator or Cloud Run endpoint.
    For testing, pass args directly.
    """
    if len(sys.argv) < 6:
        print("Usage: python onboarding_shopify.py <job_id> <client_id> <shop_domain> <email> <password>")
        print("  job_id: UUID from onboarding_jobs table")
        print("  client_id: UUID from clients table")
        print("  shop_domain: e.g. mi-tienda.myshopify.com")
        print("  email: Shopify admin email")
        print("  password: Shopify admin password")
        sys.exit(1)

    job_id = sys.argv[1]
    client_id = sys.argv[2]
    shop_domain = sys.argv[3]
    email = sys.argv[4]
    password = sys.argv[5]

    await onboard_shopify(job_id, client_id, shop_domain, email, password)


if __name__ == "__main__":
    asyncio.run(main())
