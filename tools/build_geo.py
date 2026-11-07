"""Builds the globe's geography files from Natural Earth (public domain).

Downloads once into .cache/naturalearth/ and writes, to frontend/public/geo/ (committed):
- lines.bin: coastlines and country borders (50m), simplified, in a compact binary form;
- countries.json: country shapes (110m), simplified, with ISO code, name, continent, region,
  label point and label rank (for the geography view and the place drill-down);
- labels.json: oceans and seas, mountain ranges and deserts, and major peaks, each with a
  label point and an importance rank.

Usage (from the repository root): pipeline/.venv/Scripts/python tools/build_geo.py

lines.bin layout (little-endian): b"WNGL", uint32 coastline count, uint32 border count, then
for every line: uint16 point count, then that many (int16 longitude*100, int16 latitude*100).
"""

from __future__ import annotations

import json
import struct
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "naturalearth"
OUT = ROOT / "frontend" / "public" / "geo"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
USER_AGENT = "WorldNewsGlobe/0.1 (+https://globe.krimadev.com)"

#: Simplification tolerances in degrees (Ramer-Douglas-Peucker).
LINE_TOLERANCE = 0.04
SHAPE_TOLERANCE = 0.08


def load(name: str) -> dict:
    """A Natural Earth GeoJSON file, downloaded the first time."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.geojson"
    if not path.exists():
        print(f"downloading {name}")
        request = urllib.request.Request(
            BASE + f"{name}.geojson", headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return json.loads(path.read_text(encoding="utf-8"))


def _distance_to_segment(p: list[float], a: list[float], b: list[float]) -> float:
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Ramer-Douglas-Peucker, iterative (long coastlines would overflow recursion)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        best, index = 0.0, -1
        for i in range(start + 1, end):
            d = _distance_to_segment(points[i], points[start], points[end])
            if d > best:
                best, index = d, i
        if best > tolerance and index > 0:
            keep[index] = True
            stack += [(start, index), (index, end)]
    return [p for p, k in zip(points, keep, strict=True) if k]


def lines_of(collection: dict) -> list[list[list[float]]]:
    """Every polyline in a collection of LineString / MultiLineString features."""
    lines = []
    for feature in collection["features"]:
        geometry = feature["geometry"]
        if geometry["type"] == "LineString":
            lines.append(geometry["coordinates"])
        elif geometry["type"] == "MultiLineString":
            lines.extend(geometry["coordinates"])
    return lines


def write_lines(coast: list, borders: list) -> int:
    simplified = [
        [simplify(line, LINE_TOLERANCE) for line in group] for group in (coast, borders)
    ]
    simplified = [[line for line in group if len(line) >= 2] for group in simplified]
    data = bytearray(b"WNGL")
    data += struct.pack("<II", len(simplified[0]), len(simplified[1]))
    for group in simplified:
        for line in group:
            data += struct.pack("<H", len(line))
            for lng, lat in line:
                data += struct.pack("<hh", round(lng * 100), round(lat * 100))
    (OUT / "lines.bin").write_bytes(bytes(data))
    return len(data)


def ring_area_and_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """Signed area (in square degrees) and centroid of a ring (shoelace formula)."""
    area = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True):
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area /= 2
    if abs(area) < 1e-12:
        xs, ys = zip(*ring, strict=True)
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return area, cx / (6 * area), cy / (6 * area)


def polygons_of(geometry: dict) -> list[list[list[list[float]]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    return []


def label_point(geometry: dict) -> list[float]:
    """The centroid of a shape's largest outer ring."""
    best = max(
        (ring_area_and_centroid(polygon[0]) for polygon in polygons_of(geometry)),
        key=lambda t: abs(t[0]),
    )
    return [round(best[1], 2), round(best[2], 2)]


def rounded(ring: list[list[float]]) -> list[list[float]]:
    return [[round(x, 2), round(y, 2)] for x, y in ring]


def build_countries() -> list[dict]:
    countries = []
    for feature in load("ne_110m_admin_0_countries")["features"]:
        p = feature["properties"]
        iso2 = p.get("ISO_A2_EH") or p.get("ISO_A2")
        if not iso2 or iso2 == "-99":
            continue
        polygons = []
        for polygon in polygons_of(feature["geometry"]):
            rings = [rounded(simplify(ring, SHAPE_TOLERANCE)) for ring in polygon]
            rings = [ring for ring in rings if len(ring) >= 4]
            if rings:
                polygons.append(rings)
        countries.append(
            {
                "iso2": iso2,
                "name": p.get("NAME_EN") or p["NAME"],
                "continent": p.get("CONTINENT"),
                "region": p.get("SUBREGION"),
                "label": [round(p["LABEL_X"], 2), round(p["LABEL_Y"], 2)],
                "rank": p.get("LABELRANK", 5),
                "polygons": polygons,
            }
        )
    return sorted(countries, key=lambda c: c["iso2"])


MARINE_KINDS = {"ocean", "sea", "gulf", "bay", "strait", "channel"}
REGION_KINDS = {"Range/mtn": "range", "Desert": "desert"}


def build_labels() -> dict:
    seas = [
        {
            "name": f["properties"]["name"],
            "kind": f["properties"]["featurecla"],
            "rank": f["properties"].get("scalerank", 5),
            "at": label_point(f["geometry"]),
        }
        for f in load("ne_50m_geography_marine_polys")["features"]
        if f["properties"].get("featurecla") in MARINE_KINDS
        and f["properties"].get("name")
    ]
    regions = [
        {
            "name": f["properties"]["NAME"],
            "kind": REGION_KINDS[f["properties"]["FEATURECLA"]],
            "rank": f["properties"].get("SCALERANK", 5),
            "at": label_point(f["geometry"]),
        }
        for f in load("ne_50m_geography_regions_polys")["features"]
        if f["properties"].get("FEATURECLA") in REGION_KINDS
        and f["properties"].get("NAME")
    ]
    peaks = [
        {
            "name": f["properties"]["name"],
            "elevation": int(f["properties"]["elevation"]),
            "rank": f["properties"].get("scalerank", 5),
            "at": [round(c, 2) for c in f["geometry"]["coordinates"][:2]],
        }
        for f in load("ne_10m_geography_regions_elevation_points")["features"]
        if f["properties"].get("featurecla") == "mountain"
        and f["properties"].get("name")
        and f["properties"].get("elevation")
    ]
    peaks.sort(key=lambda p: -p["elevation"])
    return {"seas": unique(seas), "regions": unique(regions), "peaks": unique(peaks)}


def unique(labels: list[dict]) -> list[dict]:
    """One label per name: the most important (lowest rank) when a name appears twice."""
    best: dict[str, dict] = {}
    for label in labels:
        key = label["name"].lower()
        if key not in best or label["rank"] < best[key]["rank"]:
            best[key] = label
    return [label for label in labels if best[label["name"].lower()] is label]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    size = write_lines(
        lines_of(load("ne_50m_coastline")),
        lines_of(load("ne_50m_admin_0_boundary_lines_land")),
    )
    print(f"wrote geo/lines.bin ({size // 1024} KB)")
    for name, data in (("countries", build_countries()), ("labels", build_labels())):
        path = OUT / f"{name}.json"
        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"wrote geo/{name}.json ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
