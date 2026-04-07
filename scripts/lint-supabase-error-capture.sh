#!/bin/bash
#
# Lint: detecta regresiones de destructurings Supabase sin error capture.
#
# Uso:
#   ./scripts/lint-supabase-error-capture.sh
#
# Compara el audit actual contra docs/audits/baseline-supabase-error-capture.json
# y falla (exit 1) si:
#   - Un archivo tiene MÁS casos que su baseline (regresión)
#   - Aparece un archivo nuevo NO listado en el baseline
#
# Pasa (exit 0) si:
#   - Todos los archivos respetan o mejoran su baseline
#
# Cuando un agente arregla casos en un archivo, debe regenerar el baseline:
#   python3 scripts/regen-baseline-supabase.py
#
# Integración sugerida:
#   - Pre-commit hook (husky o git hooks nativo)
#   - CI gate antes de merge

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINE="$REPO_ROOT/docs/audits/baseline-supabase-error-capture.json"
AUDIT_SCRIPT="$SCRIPT_DIR/audit-supabase-error-capture.py"

if [ ! -f "$BASELINE" ]; then
  echo "ERROR: baseline no encontrado en $BASELINE" >&2
  exit 2
fi

if [ ! -f "$AUDIT_SCRIPT" ]; then
  echo "ERROR: audit script no encontrado en $AUDIT_SCRIPT" >&2
  exit 2
fi

cd "$REPO_ROOT"

python3 - "$BASELINE" <<'PYEOF'
import json
import subprocess
import sys
from collections import Counter

baseline_path = sys.argv[1]

with open(baseline_path) as f:
    baseline = json.load(f)

baseline_counts = baseline.get("counts", {})

# Run audit
result = subprocess.run(
    ["python3", "scripts/audit-supabase-error-capture.py", "--json"],
    capture_output=True, text=True
)
# audit script exits 1 if hay casos — eso es esperado, no error
if result.returncode not in (0, 1):
    print(f"ERROR: audit script failed: {result.stderr}", file=sys.stderr)
    sys.exit(2)

try:
    current = json.loads(result.stdout)
except Exception as e:
    print(f"ERROR: no pude parsear audit output: {e}", file=sys.stderr)
    sys.exit(2)

current_counts = Counter(r["file"] for r in current)

regressions = []
new_files = []

for file_path, count in current_counts.items():
    base_count = baseline_counts.get(file_path)
    if base_count is None:
        new_files.append((file_path, count))
    elif count > base_count:
        regressions.append((file_path, base_count, count))

improvements = []
for file_path, base_count in baseline_counts.items():
    current = current_counts.get(file_path, 0)
    if current < base_count:
        improvements.append((file_path, base_count, current))

# Report
if not regressions and not new_files:
    print("✓ Lint OK: no hay regresiones en supabase error capture.")
    if improvements:
        print()
        print(f"📉 Mejoras ({len(improvements)} archivos):")
        for f, before, after in improvements[:10]:
            delta = before - after
            print(f"  -{delta:2d}  {f}  ({before} → {after})")
        if len(improvements) > 10:
            print(f"  ... y {len(improvements) - 10} más")
        print()
        print("💡 Regenera el baseline: python3 scripts/regen-baseline-supabase.py")
    sys.exit(0)

print("✗ Lint FAIL: regresiones detectadas en supabase error capture.")
print()

if new_files:
    print(f"🆕 Archivos nuevos con casos no listados en baseline ({len(new_files)}):")
    for f, count in new_files:
        print(f"  +{count}  {f}")
    print()

if regressions:
    print(f"📈 Archivos con MÁS casos que baseline ({len(regressions)}):")
    for f, before, after in regressions:
        delta = after - before
        print(f"  +{delta}  {f}  ({before} → {after})")
    print()

print("Reglas:")
print("  1. Arregla los casos nuevos agregando `, error: xxxError` al destructuring")
print("  2. O regenera baseline si los casos son intencionalmente nuevos:")
print("     python3 scripts/regen-baseline-supabase.py")
print()
print("Patrón correcto:")
print("  const { data: foo, error: fooErr } = await supabase.from('x').select(...);")
print("  if (fooErr) {")
print("    console.error('[context] foo fetch:', fooErr.message);")
print("    return c.json({ error: 'fetch_failed' }, 500);")
print("  }")

sys.exit(1)
PYEOF
