# DEPRECATED

All Edge Functions have been migrated to Google Cloud Run.

**New backend location:** `cloud-run-api/src/routes/`

These files are kept as reference only. Do not modify or deploy them.
All API calls go through Cloud Run via `src/lib/api.ts` → `callApi()`.
