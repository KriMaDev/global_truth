"""Build "About this place" for the geography view: facts from Wikidata and the lead text of
each place's English Wikipedia article, for every country, sea, ocean, mountain range,
desert and peak the map can label.

Reads the Wikidata IDs that Natural Earth gives each feature (written into
frontend/public/geo/countries.json, labels.json and atlas.json by tools/build_geo.py), and
matches places that have none to Wikidata only where certain (tools/place_match.py). Writes
places.json for the Geography map and places-land, -water and -city.json for the Atlas, each
loaded only when a card of that kind is first opened.

Sources and terms (checked 2026-11-07, recorded in docs/sources.md):
- Wikidata: structured data under CC0. Queried with a few batched SPARQL requests.
- Wikipedia: text under CC BY-SA 4.0. Shown word for word, with a link to the article
  revision it came from and the licence; the REST summary endpoint, one request a second,
  cached in .cache/places/ so a rebuild does not ask again.
Both with a User-Agent naming this project and its public contact address, as the
Wikimedia User-Agent policy asks.

Usage (from the repository root, with the pipeline's virtual environment):
    pipeline/.venv/Scripts/python tools/build_places.py          # uses the cache
    pipeline/.venv/Scripts/python tools/build_places.py --fresh  # fetches everything again
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

import build_geo
from place_match import Candidate, sole_match

ROOT = Path(__file__).resolve().parents[1]
GEO = ROOT / "frontend" / "public" / "geo"
CACHE = ROOT / ".cache" / "places"
USER_AGENT = (
    "WorldNewsGlobeBot/0.1 (https://globe.krimadev.com; hello@krimadev.com) python-urllib/3.13"
)
SPARQL = "https://query.wikidata.org/sparql"
SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
PAUSE_SECONDS = 1.0
BATCH = 150

# What each kind of place gets from Wikidata: (field, SPARQL pattern for ?value).
# `psn:` values are normalised to SI units (m², m); "best rank" skips outdated statements.
LABEL = "?v rdfs:label ?value . FILTER(LANG(?value) = 'en')"
# Countries that still exist (Wikidata keeps historical ones, e.g. "South Yemen").
CURRENT = "FILTER NOT EXISTS { ?v wdt:P576 ?dissolved }"
# For the whole country, not only part of it (the US's territory languages, France's CFP
# franc), and not ended (a former currency).
WHOLE = "FILTER NOT EXISTS { ?s pq:P518 ?part } FILTER NOT EXISTS { ?s pq:P582 ?ended }"


def quantity(prop: str) -> str:
    """A best-rank quantity normalised to SI units (m, m²)."""
    return (
        f"?item p:{prop} ?s . ?s a wikibase:BestRank ; psn:{prop}/wikibase:quantityAmount ?value ."
    )


FACTS: dict[str, list[tuple[str, str]]] = {
    "country": [
        ("official_name", "?item wdt:P1448 ?value . FILTER(LANG(?value) = 'en')"),
        ("capital", f"?item wdt:P36 ?v . {LABEL}"),
        (
            "population",
            "?item p:P1082 ?s . ?s a wikibase:BestRank ; ps:P1082 ?value ."
            " OPTIONAL { ?s pq:P585 ?when }",
        ),
        ("area_m2", quantity("P2046")),
        ("languages", f"?item p:P37 ?s . ?s a wikibase:BestRank ; ps:P37 ?v . {WHOLE} {LABEL}"),
        ("currency", f"?item p:P38 ?s . ?s a wikibase:BestRank ; ps:P38 ?v . {WHOLE} {LABEL}"),
        ("highest_point", f"?item wdt:P610 ?v . {LABEL}"),
    ],
    "sea": [
        ("area_m2", quantity("P2046")),
        ("max_depth_m", quantity("P4511")),
        ("countries", f"?item wdt:P205 ?v . {CURRENT} {LABEL}"),
    ],
    "region": [
        ("highest_point", f"?item wdt:P610 ?v . {LABEL}"),
        ("length_m", quantity("P2043")),
        ("area_m2", quantity("P2046")),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
    "water": [
        ("area_m2", quantity("P2046")),
        ("max_depth_m", quantity("P4511")),
        ("length_m", quantity("P2043")),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
    "city": [
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
        (
            "population",
            "?item p:P1082 ?s . ?s a wikibase:BestRank ; ps:P1082 ?value ."
            " OPTIONAL { ?s pq:P585 ?when }",
        ),
        ("area_m2", quantity("P2046")),
    ],
    "river": [
        ("length_m", quantity("P2043")),
        ("flows_into", f"?item wdt:P403 ?v . {LABEL}"),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
    "island": [
        ("area_m2", quantity("P2046")),
        ("highest_point", f"?item wdt:P610 ?v . {LABEL}"),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
    "feature": [
        ("area_m2", quantity("P2046")),
        ("highest_point", f"?item wdt:P610 ?v . {LABEL}"),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
    "state": [
        ("capital", f"?item wdt:P36 ?v . {LABEL}"),
        (
            "population",
            "?item p:P1082 ?s . ?s a wikibase:BestRank ; ps:P1082 ?value ."
            " OPTIONAL { ?s pq:P585 ?when }",
        ),
        ("area_m2", quantity("P2046")),
        ("highest_point", f"?item wdt:P610 ?v . {LABEL}"),
    ],
    "peak": [
        ("range", f"?item wdt:P4552 ?v . {LABEL}"),
        ("prominence_m", quantity("P2660")),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
}
# Fields with several values (a list); the others keep one value.
LISTS = {"languages", "currency", "countries"}
ENGLISH_LABEL = "?item rdfs:label ?value . FILTER(LANG(?value) = 'en')"
ENGLISH_DESCRIPTION = "?item schema:description ?value . FILTER(LANG(?value) = 'en')"
SITELINK = (
    "?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ;"
    " schema:name ?value ."
)


#: Wikidata types a place without an ID may match, and how far from the map it may be (km).
MATCH_RULES: dict[str, tuple[list[str], float]] = {
    "river": (["Q4022", "Q47521", "Q355304"], 150),
    "peak": (["Q8502", "Q8072", "Q207326", "Q54050"], 15),
    "lake": (["Q23397", "Q131681"], 50),
    "Mountain range": (["Q46831"], 200),
    "Desert": (["Q8514"], 200),
    "Island": (["Q23442"], 200),
    "Island group": (["Q33837", "Q23442"], 200),
    "Plateau": (["Q75520"], 200),
    "Peninsula": (["Q34763"], 200),
    "Plain": (["Q160091"], 200),
    "Delta": (["Q43197"], 200),
    "Valley": (["Q39816"], 200),
    "Cape": (["Q185113"], 200),
    "Waterfall": (["Q34038"], 200),
    "sea": (["Q165"], 200),
    "gulf": (["Q1322134"], 200),
    "bay": (["Q39594"], 200),
    "strait": (["Q37901"], 200),
    "fjord": (["Q45776"], 200),
    "lagoon": (["Q187223"], 200),
}
NAME_BATCH = 40


def request(url: str, accept: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise
            if error.code == 429 or error.code >= 500:
                time.sleep(10 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            # A dropped connection: wait and try again.
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"gave up on {url}")


def sparql(pattern: str, ids: list[str], extra: str = "") -> list[dict]:
    """Rows of ?item ?value (and ?when) for a pattern, in batches, politely."""
    rows: list[dict] = []
    for start in range(0, len(ids), BATCH):
        values = " ".join(f"wd:{qid}" for qid in ids[start : start + BATCH])
        query = f"SELECT ?item ?value {extra} WHERE {{ VALUES ?item {{ {values} }} {pattern} }}"
        body = request(
            SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"}),
            "application/sparql-results+json",
        )
        rows += json.loads(body)["results"]["bindings"]
        time.sleep(PAUSE_SECONDS)
    return rows


def query_rows(query: str) -> list[dict]:
    body = request(
        SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"}),
        "application/sparql-results+json",
    )
    time.sleep(PAUSE_SECONDS)
    return json.loads(body)["results"]["bindings"]


def candidates_for(names: list[str], types: list[str]) -> dict[str, list[Candidate]]:
    """Items of these types whose English name or alias is one of these, with their positions."""
    found: dict[str, list[Candidate]] = {}
    for start in range(0, len(names), NAME_BATCH):
        values = " ".join(f"{json.dumps(name)}@en" for name in names[start : start + NAME_BATCH])
        kinds = " ".join(f"wd:{t}" for t in types)
        rows = query_rows(
            "SELECT ?item ?name ?coord WHERE { "
            f"VALUES ?name {{ {values} }} VALUES ?type {{ {kinds} }} "
            "{ ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name } "
            "?item wdt:P31 ?type ; wdt:P625 ?coord . }"
        )
        for row in rows:
            point = row["coord"]["value"].removeprefix("Point(").removesuffix(")").split()
            if len(point) == 2:
                found.setdefault(row["name"]["value"], []).append(
                    Candidate(qid(row), float(point[0]), float(point[1]))
                )
    return found


def river_points() -> dict[str, list[list[float]]]:
    """Every point of each river as the map draws it, by name."""
    points: dict[str, list[list[float]]] = {}
    for feature in build_geo.river_features():
        name = build_geo.river_name(feature["properties"])
        if name:
            for line in build_geo.lines_of({"features": [feature]}):
                points.setdefault(name, []).extend(line[:: max(1, len(line) // 40)])
    return points


def match_missing(atlas: dict, fresh: bool) -> None:
    """Fills in the Wikidata ID of each place that has none, only where the match is certain."""
    cache = CACHE / "matches.json"
    known: dict[str, str | None] = (
        json.loads(cache.read_text(encoding="utf-8")) if cache.exists() and not fresh else {}
    )
    places: list[tuple[str, dict]] = []
    for label in atlas["waters"]:
        places.append((label["kind"], label))
    places += [("peak", label) for label in atlas["peaks"]]
    places += [(label["type"], label) for label in atlas["regions"]]
    places += [(label["kind"], label) for label in atlas["marine"]]
    missing = [(rule, p) for rule, p in places if not p.get("wikidata") and rule in MATCH_RULES]
    lines = river_points()
    for rule in sorted({rule for rule, _ in missing}):
        group = [p for r, p in missing if r == rule and f"{rule}:{p['name']}" not in known]
        if not group:
            continue
        print(f"matching {rule}: {len(group)} places")
        types, max_km = MATCH_RULES[rule]
        found = candidates_for(sorted({p["name"] for p in group}), types)
        for place in group:
            points = lines.get(place["name"], [place["at"]]) if rule == "river" else [place["at"]]
            known[f"{rule}:{place['name']}"] = sole_match(
                points, found.get(place["name"], []), max_km
            )
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(known, ensure_ascii=False, indent=0), encoding="utf-8")
    matched = 0
    for rule, place in missing:
        place["wikidata"] = known.get(f"{rule}:{place['name']}")
        matched += bool(place["wikidata"])
    print(f"matched {matched} of {len(missing)} places that had no ID")


def simple_lookup(name: str, pattern: str, ids: list[str], fresh: bool) -> dict[str, str]:
    """One English text per item (cached, asking only for items not seen before)."""
    cache = CACHE / f"wikidata-{name}.json"
    known: dict[str, str] = (
        json.loads(cache.read_text(encoding="utf-8")) if cache.exists() and not fresh else {}
    )
    wanted = [i for i in ids if i not in known]
    if wanted:
        print(f"wikidata {name}: {len(wanted)} items")
        known.update({i: "" for i in wanted})
        for row in sparql(pattern, wanted):
            known[qid(row)] = row["value"]["value"]
        CACHE.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(known, ensure_ascii=False, indent=0), encoding="utf-8")
    return known


def qid(row: dict) -> str:
    return row["item"]["value"].rsplit("/", 1)[-1]


def number(text: str) -> float | int:
    value = float(text)
    return int(value) if value.is_integer() else round(value, 1)


def wikidata_facts(kind: str, ids: list[str], fresh: bool) -> dict[str, dict]:
    """Facts per Wikidata ID for one kind of place (cached)."""
    cache = CACHE / f"wikidata-{kind}.json"
    known: dict[str, dict] = (
        json.loads(cache.read_text(encoding="utf-8")) if cache.exists() and not fresh else {}
    )
    # Only items not asked about before: a longer list of places costs only the new ones.
    wanted = [i for i in ids if i not in known]
    if not wanted:
        return known
    facts: dict[str, dict] = {i: {} for i in wanted}
    for field, pattern in [("wikipedia_title", SITELINK), *FACTS[kind]]:
        print(f"wikidata {kind}: {field} ({len(wanted)} items)")
        extra = "?when" if field == "population" else ""
        best_when: dict[str, str] = {}
        for row in sparql(pattern, wanted, extra):
            item, value = qid(row), row["value"]["value"]
            target = facts.setdefault(item, {})
            if field in LISTS:
                target.setdefault(field, [])
                if value not in target[field]:
                    target[field].append(value)
            elif field == "population":
                # The newest figure, with its year.
                when = row.get("when", {}).get("value", "")
                if field not in target or when > best_when.get(item, ""):
                    target[field] = number(value)
                    target["population_year"] = int(when[:4]) if when else None
                    best_when[item] = when
            elif field.endswith(("_m", "_m2")):
                target.setdefault(field, number(value))
            else:
                target.setdefault(field, value)
    for item in facts.values():
        for field in LISTS & item.keys():
            item[field] = sorted(item[field])[:8]
    known.update(facts)
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(known, ensure_ascii=False, indent=1), encoding="utf-8")
    return known


def summary(title: str, fresh: bool) -> dict | None:
    """The article's lead text and revision (cached per title)."""
    cache = CACHE / "wikipedia" / (urllib.parse.quote(title, safe="") + ".json")
    if cache.exists() and not fresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    try:
        body = request(
            SUMMARY + urllib.parse.quote(title.replace(" ", "_"), safe=""), "application/json"
        )
    except urllib.error.HTTPError:
        return None
    time.sleep(PAUSE_SECONDS)
    data = json.loads(body)
    if data.get("type") != "standard":
        return None  # disambiguation pages and the like are left out
    result = {
        "title": data["title"],
        "description": data.get("description"),
        "extract": data.get("extract", "").strip(),
        "url": data["content_urls"]["desktop"]["page"],
        "revision": data.get("revision"),
    }
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def ids_of(items: list[dict]) -> list[str]:
    return [item["wikidata"] for item in items if item.get("wikidata")]


def base_ids(countries: list[dict], labels: dict) -> dict[str, list[str]]:
    """What the Geography map can open: loaded in places.json."""
    capitals = [*labels.get("capitals", []), *labels.get("stateCapitals", [])]
    return {
        "country": ids_of(countries),
        "sea": ids_of(labels["seas"]),
        "city": ids_of(capitals),
        "state": ids_of(labels.get("states", [])),
    }


def atlas_ids(atlas: dict) -> dict[str, list[str]]:
    """What only the Atlas can open, by the kind of facts it gets."""
    regions = atlas["regions"]
    return {
        "region": ids_of([r for r in regions if r["kind"] in {"range", "desert"}]),
        "island": ids_of([r for r in regions if r["kind"] == "island"]),
        "feature": ids_of([r for r in regions if r["kind"] == "feature"]),
        "peak": ids_of(atlas["peaks"]),
        "sea": ids_of(atlas["marine"]),
        "water": ids_of([w for w in atlas["waters"] if w["kind"] == "lake"]),
        "river": ids_of([w for w in atlas["waters"] if w["kind"] == "river"]),
        "city": ids_of(atlas["cities"]),
    }


def as_of() -> str:
    """The date the facts and text are from: the oldest answer in the cache (a run reuses
    cached answers, so "today" would overstate how recent some of them are)."""
    files = [f for f in CACHE.rglob("*") if f.is_file()] if CACHE.exists() else []
    oldest = min((f.stat().st_mtime for f in files), default=time.time())
    return datetime.fromtimestamp(oldest, UTC).strftime("%Y-%m-%d")


def places_for(kind: str, ids: list[str], fresh: bool, about: dict[str, str]) -> dict[str, dict]:
    """Facts and article text for places of one kind."""
    facts = wikidata_facts(kind, ids, fresh)
    places: dict[str, dict] = {}
    for qid_ in ids:
        entry = {k: v for k, v in facts.get(qid_, {}).items() if v not in (None, [], "")}
        title = entry.pop("wikipedia_title", None)
        article = summary(title, fresh) if title else None
        if article and article["extract"]:
            entry["wikipedia"] = article
        elif about.get(qid_):
            entry["description"] = about[qid_]
        places[qid_] = entry
    with_text = sum("wikipedia" in places[i] for i in ids)
    print(f"{kind}: {len(ids)} places, {with_text} with text")
    return places


def write_places(name: str, places: dict[str, dict]) -> None:
    out = GEO / name
    document = {"generated": as_of(), "places": places}
    out.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"wrote geo/{name} ({out.stat().st_size // 1024} KB)")


def main() -> None:
    fresh = "--fresh" in sys.argv
    countries = json.loads((GEO / "countries.json").read_text(encoding="utf-8"))
    labels = json.loads((GEO / "labels.json").read_text(encoding="utf-8"))
    atlas_path = GEO / "atlas.json"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    match_missing(atlas, fresh)

    # Natural Earth's English city names have mistakes; Wikidata's label is the name shown.
    names = simple_lookup("city-names", ENGLISH_LABEL, ids_of(atlas["cities"]), fresh)
    for city in atlas["cities"]:
        city["name"] = names.get(city["wikidata"]) or city["name"]
    atlas_path.write_text(
        json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    base = base_ids(countries, labels)
    extra = atlas_ids(atlas)
    every = sorted({i for group in (base, extra) for ids in group.values() for i in ids})
    about = simple_lookup("descriptions", ENGLISH_DESCRIPTION, every, fresh)

    done: set[str] = set()
    main_places: dict[str, dict] = {}
    for kind, ids in base.items():
        wanted = sorted(set(ids) - done)
        main_places.update(places_for(kind, wanted, fresh, about))
        done.update(wanted)
    write_places("places.json", main_places)

    for name, kinds in (
        ("places-land.json", ("region", "island", "feature", "peak")),
        ("places-water.json", ("sea", "water", "river")),
        ("places-city.json", ("city",)),
    ):
        places: dict[str, dict] = {}
        for kind in kinds:
            wanted = sorted(set(extra[kind]) - done)
            places.update(places_for(kind, wanted, fresh, about))
            done.update(wanted)
        write_places(name, places)


if __name__ == "__main__":
    main()
