"""Build "About this place" for the geography view: facts from Wikidata and the lead text of
each place's English Wikipedia article, for every country, sea, ocean, mountain range,
desert and peak the map can label.

Reads the Wikidata IDs that Natural Earth gives each feature (written into
frontend/public/geo/countries.json and labels.json by tools/build_geo.py), and writes
frontend/public/geo/places.json, which the site loads the first time a place is opened.

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
    "peak": [
        ("range", f"?item wdt:P4552 ?v . {LABEL}"),
        ("prominence_m", quantity("P2660")),
        ("countries", f"?item wdt:P17 ?v . {CURRENT} {LABEL}"),
    ],
}
# Fields with several values (a list); the others keep one value.
LISTS = {"languages", "currency", "countries"}
SITELINK = (
    "?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ;"
    " schema:name ?value ."
)


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


def qid(row: dict) -> str:
    return row["item"]["value"].rsplit("/", 1)[-1]


def number(text: str) -> float | int:
    value = float(text)
    return int(value) if value.is_integer() else round(value, 1)


def wikidata_facts(kind: str, ids: list[str], fresh: bool) -> dict[str, dict]:
    """Facts per Wikidata ID for one kind of place (cached)."""
    cache = CACHE / f"wikidata-{kind}.json"
    if cache.exists() and not fresh:
        return json.loads(cache.read_text(encoding="utf-8"))
    facts: dict[str, dict] = {i: {} for i in ids}
    for field, pattern in [("wikipedia_title", SITELINK), *FACTS[kind]]:
        print(f"wikidata {kind}: {field}")
        extra = "?when" if field == "population" else ""
        best_when: dict[str, str] = {}
        for row in sparql(pattern, ids, extra):
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
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(facts, ensure_ascii=False, indent=1), encoding="utf-8")
    return facts


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


def places_by_kind() -> dict[str, list[str]]:
    """Wikidata IDs of every place the map can label, by kind of facts."""
    countries = json.loads((GEO / "countries.json").read_text(encoding="utf-8"))
    labels = json.loads((GEO / "labels.json").read_text(encoding="utf-8"))
    ids = {
        "country": [c["wikidata"] for c in countries],
        "sea": [s["wikidata"] for s in labels["seas"]],
        "region": [r["wikidata"] for r in labels["regions"]],
        "peak": [p["wikidata"] for p in labels["peaks"]],
    }
    return {kind: sorted({i for i in items if i}) for kind, items in ids.items()}


def main() -> None:
    fresh = "--fresh" in sys.argv
    places: dict[str, dict] = {}
    for kind, ids in places_by_kind().items():
        facts = wikidata_facts(kind, ids, fresh)
        for qid_ in ids:
            entry = {k: v for k, v in facts.get(qid_, {}).items() if v not in (None, [], "")}
            title = entry.pop("wikipedia_title", None)
            article = summary(title, fresh) if title else None
            if article and article["extract"]:
                entry["wikipedia"] = article
            places[qid_] = entry
        print(f"{kind}: {len(ids)} places, {sum('wikipedia' in places[i] for i in ids)} with text")
    out = GEO / "places.json"
    out.write_text(
        json.dumps(
            {
                "generated": datetime.now(UTC).strftime("%Y-%m-%d"),
                "places": places,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote geo/places.json ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
