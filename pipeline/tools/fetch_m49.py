"""Saves the UN M49 country/region table as pipeline/globe_pipeline/data/m49.csv.

Source: UN Statistics Division, "Standard country or area codes for statistical use (M49)",
https://unstats.un.org/unsd/methodology/m49/overview/ (English table). Run again only to
refresh it; the CSV is committed.

Usage (from the repository root): pipeline/.venv/Scripts/python pipeline/tools/fetch_m49.py
"""

from __future__ import annotations

import csv
import html
import re
import urllib.request
from pathlib import Path

URL = "https://unstats.un.org/unsd/methodology/m49/overview/"
OUT = Path(__file__).resolve().parents[1] / "globe_pipeline" / "data" / "m49.csv"
COLUMNS = ("iso2", "region", "sub_region", "intermediate_region", "country")


def cells(row: str) -> list[str]:
    raw = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
    return [html.unescape(re.sub(r"<[^>]+>", "", cell)).strip() for cell in raw]


def main() -> None:
    request = urllib.request.Request(URL, headers={"User-Agent": "WorldNewsGlobe/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        page = response.read().decode("utf-8")
    start = page.index('id = "downloadTableEN"')
    table = page[start : page.index("</table>", start)]
    rows = [cells(row) for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)]
    header, body = rows[0], rows[1:]
    index = {name: header.index(name) for name in header}
    out = []
    for row in body:
        iso2 = row[index["ISO-alpha2 Code"]]
        if not iso2:
            continue
        out.append(
            (
                iso2,
                row[index["Region Name"]],
                row[index["Sub-region Name"]],
                row[index["Intermediate Region Name"]],
                row[index["Country or Area"]],
            )
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(sorted(out))
    print(f"wrote {len(out)} countries to {OUT}")


if __name__ == "__main__":
    main()
