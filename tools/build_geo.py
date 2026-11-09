"""Builds the globe's geography files from Natural Earth (public domain).

Downloads once into .cache/naturalearth/ and writes, to frontend/public/geo/ (committed):
- lines.bin: coastlines and country borders (50m), simplified, in a compact binary form;
- countries.json: country shapes (50m), simplified, with ISO code, name, continent, region,
  label point and label rank (for the geography view and the place drill-down);
- labels.json: oceans and seas, mountain ranges and deserts, major peaks, and rivers and
  lakes, each with a label point and an importance rank;
- water.bin: rivers and lake shores (50m), simplified, in the same binary form as lines.bin;
- lakes.json: lake shapes (50m), simplified, for painting water over the country colours in the
  geography view.

Usage (from the repository root): pipeline/.venv/Scripts/python tools/build_geo.py

lines.bin layout (little-endian): b"WNGL", uint32 coastline count, uint32 border count, then
for every line: uint16 point count, then that many (int16 longitude*100, int16 latitude*100).
water.bin is the same with river count and lake-shore count.
"""

from __future__ import annotations

import itertools
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
#: Lines and shapes use the same one, so the colours stay inside the borders drawn on them.
LINE_TOLERANCE = 0.015
SHAPE_TOLERANCE = 0.015
# Islands smaller than this (square degrees, about 12 km² at the equator) are left out of the
# country shapes. Each country always keeps its largest shape, so small island nations stay.
MIN_ISLAND_AREA = 0.001
#: Rivers and lake shores are finer than coastlines (rivers are thin, lakes small).
WATER_TOLERANCE = 0.02
#: Lakes smaller than this (square degrees, about 60 km²) are left out of the lake shapes.
MIN_LAKE_AREA = 0.005
#: River label ranks by total drawn length in degrees (3: the 21 longest, e.g. Lena, Yangtze,
#: Mississippi, Danube, Amazon; 4: about 25 more; 5: about 75 more; 6: about 85 more).
RIVER_RANKS = ((3, 25.0), (4, 15.0), (5, 8.0), (6, 4.0))


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


def write_lines(
    first: list, second: list, name: str = "lines.bin", tolerance: float = LINE_TOLERANCE
) -> int:
    """Two groups of lines in the WNGL form (coastlines and borders, or rivers and lake
    shores)."""
    simplified = [[simplify(line, tolerance) for line in group] for group in (first, second)]
    simplified = [[line for line in group if len(line) >= 2] for group in simplified]
    data = bytearray(b"WNGL")
    data += struct.pack("<II", len(simplified[0]), len(simplified[1]))
    for group in simplified:
        for line in group:
            data += struct.pack("<H", len(line))
            for lng, lat in line:
                data += struct.pack("<hh", round(lng * 100), round(lat * 100))
    (OUT / name).write_bytes(bytes(data))
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


def ring_area(ring: list[list[float]]) -> float:
    """A ring's area in square degrees (shoelace formula; sign ignored)."""
    return (
        abs(
            sum(
                x1 * y2 - x2 * y1
                for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True)
            )
        )
        / 2
    )


def rounded(ring: list[list[float]]) -> list[list[float]]:
    return [[round(x, 2), round(y, 2)] for x, y in ring]


def build_countries() -> list[dict]:
    countries = []
    for feature in load("ne_50m_admin_0_countries")["features"]:
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
        if polygons:
            largest = max(polygons, key=lambda rings: ring_area(rings[0]))
            polygons = [
                rings
                for rings in polygons
                if rings is largest or ring_area(rings[0]) >= MIN_ISLAND_AREA
            ]
        countries.append(
            {
                "iso2": iso2,
                "name": p.get("NAME_EN") or p["NAME"],
                "continent": p.get("CONTINENT"),
                "region": p.get("SUBREGION"),
                "label": [round(p["LABEL_X"], 2), round(p["LABEL_Y"], 2)],
                "rank": p.get("LABELRANK", 5),
                "wikidata": p.get("WIKIDATAID") or None,
                "polygons": polygons,
            }
        )
    return sorted(countries, key=lambda c: c["iso2"])


MAX_PEAK_RANK = 7
MARINE_KINDS = {"ocean", "sea", "gulf", "bay", "strait", "channel"}
REGION_KINDS = {"Range/mtn": "range", "Desert": "desert"}
# Natural Earth abbreviates some range names ("APPALACHIAN MTS."); its English names are
# sometimes wrong for ranges, so the original names are kept and only spelled out.
ABBREVIATIONS = {
    "MTS.": "MOUNTAINS",
    "Mts.": "Mountains",
    "RA.": "RANGE",
    "Ra.": "Range",
    "CORD.": "CORDILLERA",
}


def sea_name(properties: dict) -> str:
    """English names for seas ("Gulf of California", not "Golfo de California"); oceans keep
    their own, which tell the North and South parts apart."""
    if properties.get("featurecla") == "ocean":
        return properties["name"]
    return properties.get("name_en") or properties["name"]


def region_name(name: str) -> str:
    """Spells out abbreviations and drops double spaces."""
    return " ".join(ABBREVIATIONS.get(word, word) for word in name.split())


#: Capitals whose own status as capital is disputed are shown as plain cities (rule on /sources/).
DISPUTED_CAPITALS = {"Jerusalem"}
#: Renamed since Natural Earth's data was made.
CAPITAL_NAMES = {"Nur-Sultan": "Astana"}


def build_capitals() -> list[dict]:
    """The national capitals Natural Earth marks (some countries have several)."""
    capitals = []
    for feature in load("ne_10m_populated_places")["features"]:
        p = feature["properties"]
        if p.get("ADM0CAP") != 1:
            continue
        capital = {
            "name": CAPITAL_NAMES.get(p["NAME_EN"], p["NAME_EN"]),
            "rank": 0,
            "wikidata": p.get("WIKIDATAID") or None,
            "at": [round(c, 2) for c in feature["geometry"]["coordinates"][:2]],
        }
        if p["NAME"] in DISPUTED_CAPITALS:
            capital["disputed"] = True
        capitals.append(capital)
    return sorted(capitals, key=lambda c: c["name"])


def build_labels() -> dict:
    seas = [
        {
            "name": sea_name(f["properties"]),
            "kind": f["properties"]["featurecla"],
            "rank": f["properties"].get("scalerank", 5),
            "wikidata": f["properties"].get("wikidataid") or None,
            "at": label_point(f["geometry"]),
        }
        for f in load("ne_50m_geography_marine_polys")["features"]
        if f["properties"].get("featurecla") in MARINE_KINDS and f["properties"].get("name")
    ]
    regions = [
        {
            "name": region_name(f["properties"]["NAME"]),
            "kind": REGION_KINDS[f["properties"]["FEATURECLA"]],
            "rank": f["properties"].get("SCALERANK", 5),
            "wikidata": f["properties"].get("WIKIDATAID") or None,
            "at": label_point(f["geometry"]),
        }
        for f in load("ne_50m_geography_regions_polys")["features"]
        if f["properties"].get("FEATURECLA") in REGION_KINDS and f["properties"].get("NAME")
    ]
    peaks = [
        {
            "name": f["properties"].get("name_en") or f["properties"]["name"],
            "elevation": int(f["properties"]["elevation"]),
            "rank": f["properties"].get("scalerank", 5),
            "wikidata": f["properties"].get("wikidataid") or None,
            "at": [round(c, 2) for c in f["geometry"]["coordinates"][:2]],
        }
        for f in load("ne_10m_geography_regions_elevation_points")["features"]
        if f["properties"].get("featurecla") == "mountain"
        and f["properties"].get("name")
        and f["properties"].get("elevation")
        # Less important peaks are never shown (frontend/src/geography.ts, LIMITS.peak).
        and f["properties"].get("scalerank", 9) <= MAX_PEAK_RANK
    ]
    peaks.sort(key=lambda p: -p["elevation"])
    return {
        "seas": unique(seas),
        "regions": unique(regions),
        "peaks": unique(peaks),
        "waters": build_waters(),
        "capitals": build_capitals(),
    }


def river_name(properties: dict) -> str:
    """Rivers by their English name ("Yangtze", not "Chang Jiang")."""
    return (properties.get("name_en") or properties.get("name") or "").strip()


def line_length(line: list[list[float]]) -> float:
    return sum(
        ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 for a, b in itertools.pairwise(line)
    )


def halfway(line: list[list[float]]) -> list[float]:
    """The point half way along a line (where a river's name goes)."""
    target = line_length(line) / 2
    walked = 0.0
    for a, b in itertools.pairwise(line):
        step = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        if walked + step >= target and step > 0:
            t = (target - walked) / step
            return [round(a[0] + t * (b[0] - a[0]), 2), round(a[1] + t * (b[1] - a[1]), 2)]
        walked += step
    return [round(line[-1][0], 2), round(line[-1][1], 2)]


def river_features() -> list[dict]:
    """Natural Earth's rivers (its "lake centerlines" through lakes are left out: the lakes are
    drawn themselves)."""
    return [
        f
        for f in load("ne_50m_rivers_lake_centerlines")["features"]
        if f["properties"].get("featurecla") == "River"
    ]


def lake_features() -> list[dict]:
    return load("ne_50m_lakes")["features"]


def build_waters() -> list[dict]:
    """River and lake labels, ranked like the other labels (3 for the most important, up to
    7). Lakes: Natural Earth's min_label. Rivers: by their drawn length, since Natural Earth
    gives every piece of a river system (delta branches too) the system's min_label. A river
    comes in many pieces: one label per name, half way along its longest piece."""
    rivers: dict[str, dict] = {}
    total: dict[str, float] = {}
    for f in river_features():
        name = river_name(f["properties"])
        if not name:
            continue
        for line in lines_of({"features": [f]}):
            length = line_length(line)
            total[name] = total.get(name, 0.0) + length
            best = rivers.get(name)
            if best is None or length > best["length"]:
                rivers[name] = {
                    "name": name,
                    "kind": "river",
                    "wikidata": None,
                    "at": halfway(line),
                    "length": length,
                }
    for name, river in rivers.items():
        river["rank"] = next((rank for rank, degrees in RIVER_RANKS if total[name] >= degrees), 7)
    lakes = [
        {
            "name": f["properties"]["name"].strip(),
            "kind": "lake",
            "rank": f["properties"].get("min_label", 7),
            "wikidata": f["properties"].get("wikidataid") or None,
            "at": label_point(f["geometry"]),
        }
        for f in lake_features()
        if f["properties"].get("name")
    ]
    waters = [{k: v for k, v in r.items() if k != "length"} for r in rivers.values()] + lakes
    return unique(waters)


def build_lakes() -> list[dict]:
    """Lake shapes for the geography view (painted as water over the country colours)."""
    lakes = []
    for f in lake_features():
        polygons = []
        for polygon in polygons_of(f["geometry"]):
            outer = simplify(polygon[0], WATER_TOLERANCE)
            if len(outer) >= 4 and ring_area(outer) >= MIN_LAKE_AREA:
                polygons.append([rounded(outer)])
        if polygons:
            lakes.append(
                {
                    "name": (f["properties"].get("name") or "").strip(),
                    "wikidata": f["properties"].get("wikidataid") or None,
                    "polygons": polygons,
                }
            )
    return lakes


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
    shores = [
        ring for f in lake_features() for poly in polygons_of(f["geometry"]) for ring in poly[:1]
    ]
    size = write_lines(
        lines_of({"features": river_features()}), shores, "water.bin", WATER_TOLERANCE
    )
    print(f"wrote geo/water.bin ({size // 1024} KB)")
    for name, data in (
        ("countries", build_countries()),
        ("labels", build_labels()),
        ("lakes", build_lakes()),
    ):
        path = OUT / f"{name}.json"
        path.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"wrote geo/{name}.json ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
