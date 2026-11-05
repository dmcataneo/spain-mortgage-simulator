#!/usr/bin/env python3
"""Refresh src/euribor-data.js with the latest official one-year Euribor series.

Pulls series D_1NBAF472 (one-year Euribor, monthly average, percent) from the
Banco de Espana statistics API and rewrites the data file the page embeds.
The most recent month is marked provisional until it is published in the BOE.

Usage: python3 scripts/update_euribor.py
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

SERIES = "D_1NBAF472"
URL = (
    "https://app.bde.es/bierest/resources/srdatosapp/listaSeries"
    f"?idioma=en&series={SERIES}&rango=MAX"
)
OUT = Path(__file__).resolve().parent.parent / "src" / "euribor-data.js"


def main() -> int:
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"})
    import gzip

    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    payload = json.loads(raw)
    serie = payload[0]
    pairs = sorted((f[:7], round(float(v), 3)) for f, v in zip(serie["fechas"], serie["valores"]))
    if len(pairs) < 300:
        print(f"Only {len(pairs)} months returned; refusing to overwrite.", file=sys.stderr)
        return 1
    rows = ",\n  ".join(json.dumps([ym, v]) for ym, v in pairs)
    today = date.today().isoformat()
    OUT.write_text(
        f"""// One-year Euribor, monthly average, percent.
// Source: Banco de Espana, official mortgage-market reference rate, series {SERIES}
// ({serie['descripcionCorta']}), pulled from the BdE statistics API on {today}.
// The most recent month is provisional until it appears in the BOE.
// Refresh with: python3 scripts/update_euribor.py
window.EURIBOR = {{
  series: "{SERIES}",
  source: "Banco de Espana (BIEST API)",
  retrieved: "{today}",
  unit: "%",
  provisional: ["{pairs[-1][0]}"],
  data: [
  {rows}
  ]
}};
"""
    )
    print(f"Wrote {OUT} with {len(pairs)} months, {pairs[0][0]} to {pairs[-1][0]} (latest {pairs[-1][1]}%).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
