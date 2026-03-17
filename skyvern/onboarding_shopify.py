"""
Onboarding Shopify — OAuth flow (zero browser automation).

En vez de usar Skyvern para login + crear app, usamos el flujo OAuth
estándar de Shopify que ya existe en Cloud Run:

  GET  /api/shopify-install?shop={domain}          → redirige a Shopify OAuth
  GET  /api/shopify-oauth-callback?code=...&shop=... → intercambia code por token

El merchant hace un click, Shopify pide permiso, y el token se guarda
automáticamente encriptado en platform_connections.

Este módulo:
  1. Genera la URL de instalación OAuth para el merchant
  2. Monitorea onboarding_jobs hasta que el callback actualice el status
  3. Puede ser llamado desde el endpoint /api/onboarding-bot o directamente

NO HAY BROWSER. NO HAY CREDENCIALES. El merchant autoriza directo en Shopify.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

STEVE_API_URL = os.environ.get(
    "STEVE_API_URL",
    "https://steve-api-850416724643.us-central1.run.app",
)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _get_supabase():
    if not SUPABASE_URL:
        return None
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def generate_install_url(shop_domain: str, client_id: str | None = None) -> str:
    """
    Generate the Shopify OAuth install URL.

    This URL is what the merchant clicks. It redirects to Shopify,
    merchant approves scopes, Shopify redirects back to our callback,
    and the token gets saved automatically.

    Args:
        shop_domain: e.g. "raicesdelalma.myshopify.com"
        client_id: Optional — if provided, uses per-client credentials

    Returns:
        Install URL string
    """
    domain = shop_domain.strip().lower()
    if not domain.endswith(".myshopify.com"):
        domain = f"{domain}.myshopify.com"

    url = f"{STEVE_API_URL}/api/shopify-install?shop={domain}"
    if client_id:
        url += f"&client_id={client_id}"

    return url


async def start_shopify_onboarding(job_id: str, client_id: str, shop_domain: str) -> str:
    """
    Start Shopify onboarding via OAuth.

    1. Generate install URL
    2. Update onboarding_jobs with the URL for the frontend to redirect
    3. Return the install URL

    The frontend shows this URL to the merchant. When the merchant
    clicks it, Shopify OAuth runs and the callback updates
    platform_connections. The shopify-oauth-callback also marks
    the onboarding job as completed via the onboarding_job_id.
    """
    sb = _get_supabase()

    domain = shop_domain.strip().lower()
    if not domain.endswith(".myshopify.com"):
        domain = f"{domain}.myshopify.com"

    install_url = generate_install_url(domain, client_id)

    if sb and job_id != "test":
        sb.table("onboarding_jobs").update({
            "shopify_status": "waiting_oauth",
            "shopify_step": "Esperando autorizacion del merchant...",
            "shopify_install_url": install_url,
        }).eq("id", job_id).execute()

    print(f"[onboarding-shopify] Install URL generated for {domain}")
    print(f"  URL: {install_url}")

    return install_url


async def poll_shopify_connection(
    job_id: str,
    client_id: str,
    shop_domain: str,
    timeout_seconds: int = 300,
) -> bool:
    """
    Poll platform_connections until Shopify token appears.

    Called after merchant is redirected to OAuth. The callback
    handler saves the token, so we just wait for it to appear.

    Returns True if connection found, False if timeout.
    """
    sb = _get_supabase()
    if not sb:
        print("  [poll] No Supabase — cannot poll. Check manually.")
        return False

    domain = shop_domain.strip().lower()
    if not domain.endswith(".myshopify.com"):
        domain = f"{domain}.myshopify.com"

    elapsed = 0
    while elapsed < timeout_seconds:
        # Check if token exists and is active
        result = (
            sb.table("platform_connections")
            .select("id, is_active, store_name, access_token_encrypted")
            .eq("client_id", client_id)
            .eq("platform", "shopify")
            .eq("is_active", True)
            .single()
            .execute()
        )

        if result.data and result.data.get("access_token_encrypted"):
            store_name = result.data.get("store_name", domain)
            print(f"  [poll] Shopify connected: {store_name}")

            # Update onboarding job
            sb.table("onboarding_jobs").update({
                "shopify_status": "completed",
                "shopify_step": f"Conectado — {store_name}",
            }).eq("id", job_id).execute()

            return True

        await asyncio.sleep(3)
        elapsed += 3
        if elapsed % 30 == 0:
            print(f"  [poll] Waiting for OAuth... ({elapsed}s)")

    # Timeout
    sb.table("onboarding_jobs").update({
        "shopify_status": "failed",
        "shopify_step": "Timeout: el merchant no completo la autorizacion",
    }).eq("id", job_id).execute()

    return False


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

async def main():
    """
    Usage:
      python onboarding_shopify.py <shop_domain> [client_id] [job_id]

    Generates the OAuth install URL and optionally polls for connection.

    No credentials needed — the merchant authorizes directly with Shopify.

    Environment:
      STEVE_API_URL              — Cloud Run API URL (default: production)
      SUPABASE_URL               — If set, updates onboarding_jobs
      SUPABASE_SERVICE_ROLE_KEY  — Required if SUPABASE_URL is set
    """
    if len(sys.argv) < 2:
        print("Usage: python onboarding_shopify.py <shop_domain> [client_id] [job_id]")
        print()
        print("Generates the Shopify OAuth install URL for the merchant.")
        print("No browser automation, no credentials — pure OAuth 2.0.")
        print()
        print("Example:")
        print("  python onboarding_shopify.py raicesdelalma.myshopify.com")
        sys.exit(1)

    shop_domain = sys.argv[1]
    client_id = sys.argv[2] if len(sys.argv) > 2 else "test"
    job_id = sys.argv[3] if len(sys.argv) > 3 else "test"

    print(f"[onboarding-shopify] OAuth flow for {shop_domain}")
    print(f"  API: {STEVE_API_URL}")
    print(f"  DB: {'configured' if SUPABASE_URL else 'test mode'}")
    print()

    install_url = await start_shopify_onboarding(job_id, client_id, shop_domain)

    print()
    print("=" * 60)
    print("MERCHANT INSTALL URL:")
    print(install_url)
    print("=" * 60)
    print()
    print("Send this URL to the merchant. When they click it:")
    print("  1. Shopify shows permission screen")
    print("  2. Merchant clicks 'Install'")
    print("  3. Token is saved automatically in platform_connections")
    print("  4. Webhooks are registered")
    print()

    # If we have Supabase and a real job, poll for completion
    if SUPABASE_URL and job_id != "test" and client_id != "test":
        print("Polling for OAuth completion (5 min timeout)...")
        connected = await poll_shopify_connection(job_id, client_id, shop_domain)
        if connected:
            print("[onboarding-shopify] SUCCESS — Shopify connected via OAuth")
        else:
            print("[onboarding-shopify] TIMEOUT — merchant did not complete OAuth")
    else:
        print("(Test mode — not polling. Send the URL to the merchant manually.)")


if __name__ == "__main__":
    asyncio.run(main())
