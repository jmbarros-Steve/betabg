"""
Detective Meta — Verifica campañas Meta contra Supabase.

Consulta la Graph API de Meta para obtener el estado real de una campaña
y lo compara con lo que está en Supabase (meta_campaigns / platform_metrics).
Si hay diferencias → inserta task en Supabase para investigar.

Uso:
  python skyvern/detective_meta.py --campaign-id 123456 --connection-id uuid

O como módulo:
  from detective_meta import verify_campaign
  await verify_campaign(campaign_id="123456", connection_id="uuid")

Requiere env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import asyncio
import os
import sys
import json
from datetime import datetime, timezone
from typing import Optional

try:
    import httpx
except ImportError:
    print("pip install httpx")
    sys.exit(1)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
META_API_VERSION = "v21.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

CAMPAIGN_FIELDS = "id,name,status,effective_status,daily_budget,lifetime_budget,objective,updated_time"


def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


async def get_decrypted_token(client: httpx.AsyncClient, connection_id: str) -> Optional[str]:
    """Get decrypted Meta token from platform_connections via RPC."""
    # First get the encrypted token
    resp = await client.get(
        f"{SUPABASE_URL}/rest/v1/platform_connections",
        headers=supabase_headers(),
        params={
            "select": "encrypted_token",
            "id": f"eq.{connection_id}",
        },
    )
    if resp.status_code != 200 or not resp.json():
        print(f"[detective] Connection {connection_id} not found")
        return None

    encrypted = resp.json()[0].get("encrypted_token")
    if not encrypted:
        print(f"[detective] No encrypted token for {connection_id}")
        return None

    # Decrypt via RPC
    resp = await client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/decrypt_platform_token",
        headers=supabase_headers(),
        json={"encrypted_token": encrypted},
    )
    if resp.status_code != 200:
        print(f"[detective] Decrypt RPC failed: {resp.text}")
        return None

    return resp.json()


async def fetch_meta_campaign(client: httpx.AsyncClient, campaign_id: str, token: str) -> Optional[dict]:
    """Fetch campaign data directly from Meta Graph API."""
    url = f"{META_BASE}/{campaign_id}"
    resp = await client.get(
        url,
        params={
            "fields": CAMPAIGN_FIELDS,
            "access_token": token,
        },
        timeout=15.0,
    )

    if resp.status_code != 200:
        error = resp.json().get("error", {})
        print(f"[detective] Meta API error: {error.get('message', resp.text)}")
        return None

    return resp.json()


async def fetch_supabase_campaign(client: httpx.AsyncClient, campaign_id: str) -> Optional[dict]:
    """Fetch what Supabase thinks the campaign looks like."""
    # Try meta_campaigns table first
    resp = await client.get(
        f"{SUPABASE_URL}/rest/v1/meta_campaigns",
        headers=supabase_headers(),
        params={
            "select": "id,campaign_id,name,status,daily_budget,objective,updated_at",
            "campaign_id": f"eq.{campaign_id}",
            "limit": "1",
        },
    )

    if resp.status_code == 200 and resp.json():
        return resp.json()[0]

    # Fallback: check creative_history
    resp = await client.get(
        f"{SUPABASE_URL}/rest/v1/creative_history",
        headers=supabase_headers(),
        params={
            "select": "id,entity_id,channel,performance_score",
            "entity_id": f"eq.{campaign_id}",
            "channel": "eq.meta",
            "limit": "1",
        },
    )

    if resp.status_code == 200 and resp.json():
        row = resp.json()[0]
        return {"campaign_id": campaign_id, "source": "creative_history", **row}

    return None


def find_differences(meta: dict, supabase_data: Optional[dict]) -> list[dict]:
    """Compare Meta reality vs Supabase records. Returns list of diffs."""
    diffs = []

    if supabase_data is None:
        diffs.append({
            "field": "existence",
            "meta_value": f"Campaign {meta['id']} exists in Meta",
            "supabase_value": "NOT FOUND in Supabase",
            "severity": "high",
        })
        return diffs

    # Compare status
    meta_status = meta.get("effective_status") or meta.get("status")
    sb_status = supabase_data.get("status")
    if sb_status and meta_status and meta_status.upper() != sb_status.upper():
        diffs.append({
            "field": "status",
            "meta_value": meta_status,
            "supabase_value": sb_status,
            "severity": "high",
        })

    # Compare name
    meta_name = meta.get("name")
    sb_name = supabase_data.get("name")
    if sb_name and meta_name and meta_name != sb_name:
        diffs.append({
            "field": "name",
            "meta_value": meta_name,
            "supabase_value": sb_name,
            "severity": "low",
        })

    # Compare daily budget
    meta_budget = meta.get("daily_budget")
    sb_budget = supabase_data.get("daily_budget")
    if meta_budget and sb_budget:
        # Meta returns budget in cents, Supabase might store differently
        meta_cents = int(meta_budget)
        sb_cents = int(float(sb_budget))
        if meta_cents != sb_cents:
            diffs.append({
                "field": "daily_budget",
                "meta_value": meta_cents,
                "supabase_value": sb_cents,
                "severity": "medium",
            })

    return diffs


async def create_task(client: httpx.AsyncClient, campaign_id: str, diffs: list[dict]) -> bool:
    """Insert a task in Supabase for the detected differences."""
    diff_lines = "\n".join(
        f"- {d['field']}: Meta={d['meta_value']} vs Supabase={d['supabase_value']} ({d['severity']})"
        for d in diffs
    )
    max_severity = "critica" if any(d["severity"] == "high" for d in diffs) else "alta"

    resp = await client.post(
        f"{SUPABASE_URL}/rest/v1/tasks",
        headers=supabase_headers(),
        json={
            "title": f"Meta drift: campaña {campaign_id} ({len(diffs)} diferencia(s))",
            "description": f"Detective Meta encontró diferencias entre Meta Graph API y Supabase:\n{diff_lines}",
            "priority": max_severity,
            "type": "fix",
            "source": "ojos",
            "status": "pending",
        },
    )

    if resp.status_code in (200, 201):
        print(f"[detective] Task created for campaign {campaign_id} ({max_severity})")
        return True
    else:
        print(f"[detective] Failed to create task: {resp.text}")
        return False


async def log_result(client: httpx.AsyncClient, campaign_id: str, diffs: list[dict], meta: dict):
    """Log the check result to qa_log."""
    await client.post(
        f"{SUPABASE_URL}/rest/v1/qa_log",
        headers=supabase_headers(),
        json={
            "check_type": "detective_meta_campaign",
            "status": "fail" if diffs else "pass",
            "details": json.dumps({
                "campaign_id": campaign_id,
                "campaign_name": meta.get("name"),
                "diffs": diffs,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }),
        },
    )


async def verify_campaign(campaign_id: str, connection_id: str) -> dict:
    """
    Main entry point: verify a single Meta campaign against Supabase.
    Returns: { ok: bool, diffs: list, task_created: bool }
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"ok": False, "error": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"}

    async with httpx.AsyncClient() as client:
        # 1. Get token
        token = await get_decrypted_token(client, connection_id)
        if not token:
            return {"ok": False, "error": "Could not decrypt token"}

        # 2. Fetch from Meta
        meta = await fetch_meta_campaign(client, campaign_id, token)
        if not meta:
            return {"ok": False, "error": "Meta API returned no data"}

        # 3. Fetch from Supabase
        sb = await fetch_supabase_campaign(client, campaign_id)

        # 4. Compare
        diffs = find_differences(meta, sb)

        # 5. Log result
        await log_result(client, campaign_id, diffs, meta)

        # 6. Create task if differences found
        task_created = False
        if diffs:
            task_created = await create_task(client, campaign_id, diffs)
            for d in diffs:
                print(f"[detective] DRIFT: {d['field']} — Meta: {d['meta_value']} vs Supabase: {d['supabase_value']}")
        else:
            print(f"[detective] Campaign {campaign_id} ({meta.get('name')}): OK — no drift")

        return {
            "ok": len(diffs) == 0,
            "campaign_id": campaign_id,
            "campaign_name": meta.get("name"),
            "meta_status": meta.get("effective_status"),
            "diffs": diffs,
            "task_created": task_created,
        }


async def verify_all_campaigns(connection_id: str) -> list[dict]:
    """
    Verify ALL active campaigns for a given connection.
    Fetches campaign list from Meta, then verifies each one.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return [{"ok": False, "error": "Missing env vars"}]

    async with httpx.AsyncClient() as client:
        token = await get_decrypted_token(client, connection_id)
        if not token:
            return [{"ok": False, "error": "Could not decrypt token"}]

        # Get ad account ID from connection
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/platform_connections",
            headers=supabase_headers(),
            params={
                "select": "meta_ad_account_id",
                "id": f"eq.{connection_id}",
            },
        )
        if resp.status_code != 200 or not resp.json():
            return [{"ok": False, "error": "Connection not found"}]

        ad_account_id = resp.json()[0].get("meta_ad_account_id")
        if not ad_account_id:
            return [{"ok": False, "error": "No ad account ID"}]

        # Fetch campaigns from Meta
        campaigns_resp = await client.get(
            f"{META_BASE}/act_{ad_account_id}/campaigns",
            params={
                "fields": CAMPAIGN_FIELDS,
                "effective_status": '["ACTIVE","PAUSED"]',
                "limit": "50",
                "access_token": token,
            },
            timeout=20.0,
        )

        if campaigns_resp.status_code != 200:
            return [{"ok": False, "error": f"Meta API: {campaigns_resp.text}"}]

        campaigns = campaigns_resp.json().get("data", [])
        print(f"[detective] Found {len(campaigns)} campaigns for act_{ad_account_id}")

    # Verify each campaign (reuses verify_campaign which opens its own client)
    results = []
    for campaign in campaigns:
        result = await verify_campaign(campaign["id"], connection_id)
        results.append(result)

    total_drifts = sum(1 for r in results if not r.get("ok", True))
    print(f"[detective] Done: {len(results)} campaigns checked, {total_drifts} with drift")
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Detective Meta — verify campaign data vs Supabase")
    parser.add_argument("--campaign-id", help="Single campaign ID to verify")
    parser.add_argument("--connection-id", required=True, help="platform_connections UUID")
    parser.add_argument("--all", action="store_true", help="Verify all campaigns for this connection")
    args = parser.parse_args()

    if not args.campaign_id and not args.all:
        parser.error("Provide --campaign-id or --all")

    if args.all:
        results = asyncio.run(verify_all_campaigns(args.connection_id))
    else:
        result = asyncio.run(verify_campaign(args.campaign_id, args.connection_id))
        results = [result]

    # Exit code based on drifts
    has_drift = any(not r.get("ok", True) for r in results)
    sys.exit(1 if has_drift else 0)
