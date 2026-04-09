#!/usr/bin/env python3
"""
Audit script: detecta destructurings de queries Supabase sin capturar `error`.

Patrón bug sistémico que ya causó 6 bugs en el loop del Brain:
    const { data: foo } = await supabase.from('x').select(...)
         ↑ sin `, error: ...` → si la query falla, data=null silencioso.

Uso:
    python3 scripts/audit-supabase-error-capture.py [--json] [--dir DIR]

Output:
    - Modo texto (default): tabla legible por severidad + file:line
    - Modo JSON: lista estructurada para procesamiento downstream

Severidad:
    CRITICAL = /cron/       (corren sin supervisión, silent failures = bugs ocultos)
    HIGH     = /lib/        (compartido por muchas rutas)
    HIGH     = /chino/      (QA, security, debe ser confiable)
    HIGH     = /ai/         (decisiones del Brain)
    MEDIUM   = /routes/meta,/google,/klaviyo (rutas críticas de clientes)
    LOW      = otras rutas, edge functions
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Multiline regex: captura destructurings de supabase queries
# Matches:
#   const { data } = await supabase.from(...)
#   const { data: foo } = await supabase.from(...)
#   const { data: foo, count } = await supabase.from(...)
#   const {\n  data: foo\n} = await supabase\n  .from(...)
# Aware: maneja saltos de línea dentro del destructuring y antes de .from()
SUPABASE_DESTRUCTURE = re.compile(
    r"const\s*\{\s*([^}]*?data[^}]*?)\}\s*=\s*await\s+(\w+(?:\.\w+)*)\s*\n?\s*\.from\s*\(",
    re.DOTALL,
)

# Heurística: verificamos si el destructuring tiene `error` como identifier
# aislado. Excluye `error_detail`, `error_message`, `_error`, etc (son fields
# de tablas como qa_log, no el error-return de supabase).
# Matches: `error`, `error:`, `, error`, `error }`, pero NO `error_foo` / `foo_error`.
HAS_ERROR_KEY = re.compile(r"(?<![a-zA-Z0-9_])error(?![a-zA-Z0-9_])")


def classify_severity(path: Path) -> str:
    s = str(path)
    if "/cron/" in s:
        return "CRITICAL"
    if "/lib/" in s:
        return "HIGH"
    if "/chino/" in s:
        return "HIGH"
    if "/routes/ai/" in s:
        return "HIGH"
    if any(m in s for m in ["/routes/meta/", "/routes/google/", "/routes/klaviyo/", "/routes/shopify/", "/routes/whatsapp/"]):
        return "MEDIUM"
    return "LOW"


def audit(root: Path) -> list[dict]:
    results = []
    for ts_file in sorted(root.rglob("*.ts")):
        # skip tests, node_modules, dist
        parts = ts_file.parts
        if any(p in parts for p in ("node_modules", "dist", "test")):
            continue
        if ts_file.name.endswith((".test.ts", ".spec.ts", ".d.ts")):
            continue

        try:
            content = ts_file.read_text(encoding="utf-8")
        except Exception:
            continue

        for match in SUPABASE_DESTRUCTURE.finditer(content):
            destructured = match.group(1).strip()
            receiver = match.group(2)

            # skip si no es un cliente supabase-like
            # (puede ser false positive, ej. algún otro ORM)
            if "supabase" not in receiver.lower():
                # Verificar por contexto: buscar `supabase` o `.rpc(` cercano
                continue

            if HAS_ERROR_KEY.search(destructured):
                continue  # OK, captura error

            line_num = content[: match.start()].count("\n") + 1
            results.append({
                "file": str(ts_file),
                "line": line_num,
                "severity": classify_severity(ts_file),
                "destructured": destructured.replace("\n", " ").strip()[:80],
            })

    # ordenar por severidad > archivo > línea
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    results.sort(key=lambda r: (severity_order.get(r["severity"], 99), r["file"], r["line"]))
    return results


def print_text(results: list[dict]):
    if not results:
        print("✓ No se encontraron destructurings sin error capture.")
        return

    by_sev = {}
    for r in results:
        by_sev.setdefault(r["severity"], []).append(r)

    print(f"\n{'=' * 72}")
    print(f"AUDIT: Destructurings Supabase sin error capture")
    print(f"{'=' * 72}\n")

    total = len(results)
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        items = by_sev.get(sev, [])
        if not items:
            continue
        print(f"[{sev}] {len(items)} casos")
        for r in items:
            print(f"  {r['file']}:{r['line']}")
            print(f"    {{ {r['destructured']} }}")
        print()

    print(f"{'─' * 72}")
    print(f"TOTAL: {total}")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        n = len(by_sev.get(sev, []))
        if n:
            print(f"  {sev}: {n}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON for downstream processing")
    parser.add_argument("--dir", default="cloud-run-api/src", help="Directory to audit")
    parser.add_argument("--severity", default=None, help="Filter by minimum severity (CRITICAL|HIGH|MEDIUM|LOW)")
    args = parser.parse_args()

    # Resolver paths relativos desde la raíz del repo (no del CWD)
    if not Path(args.dir).is_absolute():
        script_root = Path(__file__).resolve().parent.parent
        root = script_root / args.dir
    else:
        root = Path(args.dir)
    if not root.is_dir():
        print(f"ERROR: {root} no es un directorio", file=sys.stderr)
        sys.exit(1)

    results = audit(root)

    if args.severity:
        order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        threshold = order.get(args.severity.upper(), 99)
        results = [r for r in results if order.get(r["severity"], 99) <= threshold]

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print_text(results)

    sys.exit(1 if results else 0)


if __name__ == "__main__":
    main()
