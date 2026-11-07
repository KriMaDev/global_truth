"""Builds the compact gazetteer the pipeline uses for reverse geocoding.

Downloads from GeoNames (CC BY 4.0, https://www.geonames.org/) once into .cache/geonames/:
cities15000.zip (every place over 15,000 people), countryInfo.txt and admin1CodesASCII.txt.
Adds the UN M49 regions from globe_pipeline/data/m49.csv, and writes
.cache/gazetteer/gazetteer.json.gz (git-ignored; cached by month in GitHub Actions).

Usage (from the repository root): pipeline/.venv/Scripts/python pipeline/tools/build_gazetteer.py
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "geonames"
OUT = ROOT / ".cache" / "gazetteer" / "gazetteer.json.gz"
M49 = ROOT / "pipeline" / "globe_pipeline" / "data" / "m49.csv"
BASE = "https://download.geonames.org/export/dump/"
FILES = ("cities15000.zip", "countryInfo.txt", "admin1CodesASCII.txt")
CONTINENTS = {
    "AF": "Africa",
    "AN": "Antarctica",
    "AS": "Asia",
    "EU": "Europe",
    "NA": "North America",
    "OC": "Oceania",
    "SA": "South America",
}


def download(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / name
    if not target.exists():
        print(f"downloading {BASE}{name}")
        request = urllib.request.Request(BASE + name, headers={"User-Agent": "WorldNewsGlobe/0.1"})
        with urllib.request.urlopen(request, timeout=120) as response:
            target.write_bytes(response.read())
    return target


def read_cities(path: Path) -> list[list]:
    with zipfile.ZipFile(path) as archive:
        text = archive.read("cities15000.txt").decode("utf-8")
    cities = []
    for line in text.splitlines():
        f = line.split("\t")
        # name, latitude, longitude, country code, admin1 code, population
        cities.append(
            [f[1], round(float(f[4]), 4), round(float(f[5]), 4), f[8], f[10], int(f[14] or 0)]
        )
    return cities


def read_countries(path: Path) -> dict[str, dict]:
    countries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        f = line.split("\t")
        countries[f[0]] = {
            "name": f[4],
            "continent": CONTINENTS.get(f[8], f[8]),
            "iso3": f[1],
            "fips": f[3],
        }
    return countries


def read_admin1(path: Path) -> dict[str, str]:
    return {
        f[0]: f[1]
        for f in (line.split("\t") for line in path.read_text(encoding="utf-8").splitlines())
        if len(f) > 1
    }


def read_m49() -> dict[str, dict]:
    with M49.open(encoding="utf-8") as file:
        return {
            row["iso2"]: {
                "region": row["intermediate_region"] or row["sub_region"] or row["region"],
            }
            for row in csv.DictReader(file)
        }


def main() -> None:
    paths = {name: download(name) for name in FILES}
    data = {
        "source": "GeoNames (CC BY 4.0) and UN M49",
        "cities": read_cities(paths["cities15000.zip"]),
        "countries": read_countries(paths["countryInfo.txt"]),
        "admin1": read_admin1(paths["admin1CodesASCII.txt"]),
        "m49": read_m49(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as gz:
        gz.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    OUT.write_bytes(buffer.getvalue())
    print(f"wrote {OUT} ({len(data['cities'])} cities, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
