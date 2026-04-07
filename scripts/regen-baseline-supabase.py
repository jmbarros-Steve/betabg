#!/usr/bin/env python3
"""
Regenera el baseline de supabase-error-capture desde el audit actual.

Uso:
    python3 scripts/regen-baseline-supabase.py

Cuándo correrlo:
    - Después de arreglar casos en un archivo (el lint mostrará "mejoras")
    - Cuando se agregan archivos nuevos intencionalmente que aún no capturan
      error (raro — preferir siempre capturar error-first)

Output:
    Sobrescribe docs/audits/baseline-supabase-error-capture.json con los
    conteos actuales. Hacer commit del baseline resultante.
"""
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "docs" / "audits" / "baseline-supabase-error-capture.json"
AUDIT_SCRIPT = ROOT / "scripts" / "audit-supabase-error-capture.py"


def main():
    if not AUDIT_SCRIPT.exists():
        print(f"ERROR: audit script no encontrado en {AUDIT_SCRIPT}", file=sys.stderr)
        sys.exit(2)

    result = subprocess.run(
        ["python3", str(AUDIT_SCRIPT), "--json"],
        capture_output=True, text=True, cwd=ROOT,
    )
    if result.returncode not in (0, 1):
        print(f"ERROR: audit script failed: {result.stderr}", file=sys.stderr)
        sys.exit(2)

    data = json.loads(result.stdout)
    by_file = Counter(r["file"] for r in data)

    old_total = None
    if BASELINE_PATH.exists():
        with open(BASELINE_PATH) as f:
            old = json.load(f)
        old_total = old.get("_total")

    baseline = {
        "_comment": "Baseline de casos supabase-error-capture. Cada archivo listado tiene N casos tolerados. El script lint-supabase-error-capture.sh falla si un archivo tiene MÁS casos que su baseline (regresión) o si aparece un archivo nuevo no listado. Cuando un agente arregla casos, debe regenerar este baseline con: python3 scripts/regen-baseline-supabase.py",
        "_generated_at": str(date.today()),
        "_total": len(data),
        "_files": len(by_file),
        "counts": dict(sorted(by_file.items())),
    }

    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BASELINE_PATH, "w") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"✓ Baseline regenerado: {BASELINE_PATH}")
    print(f"  Files: {len(by_file)}")
    print(f"  Total casos: {len(data)}")
    if old_total is not None:
        delta = old_total - len(data)
        if delta > 0:
            print(f"  📉 Mejora: -{delta} casos respecto al baseline anterior ({old_total} → {len(data)})")
        elif delta < 0:
            print(f"  📈 REGRESIÓN: +{-delta} casos nuevos ({old_total} → {len(data)})")
            print(f"     ¿Estás seguro de commitear este baseline?")
        else:
            print(f"  = Sin cambios respecto al baseline anterior")


if __name__ == "__main__":
    main()
