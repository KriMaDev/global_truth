"""News from GDELT's Global Knowledge Graph (GKG 2.1), allowlisted outlets only.

GDELT publishes a file every 15 minutes listing the articles it has read, each with the page
title, URL, outlet, places mentioned (with coordinates, machine-coded from the full text) and
themes. We keep articles from the outlets in outlets.py that fall into one of our five
categories, and show the headline, outlet, time and link only.

GDELT data is free for any use with credit and a link to https://www.gdeltproject.org/.
Files are fetched politely: only those since the last run, a pause between downloads.
"""

from __future__ import annotations

import hashlib
import io
import re
import time
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from ..categorize import categorize_news
from ..geocode import Gazetteer, place_name
from ..http import FetchError, get
from ..models import Event, Geo, Source
from ..normalize import clean_text
from ..outlets import clean_headline, outlet_for_url
from ..severity import news_severity

ID = "gdelt"
NAME = "GDELT Project (Global Knowledge Graph), allowlisted outlets"
HOMEPAGE = "https://www.gdeltproject.org/"
LAST_UPDATE = "https://data.gdeltproject.org/gdeltv2/lastupdate.txt"
FILE_URL = "https://data.gdeltproject.org/gdeltv2/{stamp}.gkg.csv.zip"
STEP = timedelta(minutes=15)
#: On a fresh start (no cursor), read this far back.
BACKFILL = timedelta(hours=6)
#: Never read more files than this in one run.
MAX_FILES = 24
PAUSE_SECONDS = 2.0
MIN_TITLE_LENGTH = 20

_TITLE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.S)
# GKG 2.1 columns used (0-based).
COL_DATE, COL_URL, COL_THEMES, COL_LOCATIONS, COL_EXTRAS = 1, 4, 7, 10, 26
CITY_TYPES, REGION_TYPES, COUNTRY_TYPES = {3, 4}, {2, 5}, {1}


@dataclass(frozen=True)
class Mention:
    """One place an article mentions (a GKG V2Locations entry)."""

    type: int
    name: str
    fips: str
    lat: float
    lng: float
    offset: int


def stamp(moment: datetime) -> str:
    return moment.strftime("%Y%m%d%H%M%S")


def parse_stamp(text: str) -> datetime:
    return datetime.strptime(text, "%Y%m%d%H%M%S").replace(tzinfo=UTC)


def parse_mentions(field: str) -> list[Mention]:
    """The places in a V2Locations field, in the order the article mentions them."""
    mentions = []
    for entry in filter(None, field.split(";")):
        parts = entry.split("#")
        if len(parts) < 9 or not parts[5] or not parts[6]:
            continue
        try:
            mentions.append(
                Mention(
                    int(parts[0]),
                    parts[1],
                    parts[2],
                    float(parts[5]),
                    float(parts[6]),
                    int(parts[8] or 0),
                )
            )
        except ValueError:
            continue
    return sorted(mentions, key=lambda m: m.offset)


def _name_parts(mention: Mention) -> list[str]:
    """The parts of a place name ("Sanaa, Amanat Al Asimah, Yemen" -> three parts)."""
    return [part.strip() for part in mention.name.split(",") if len(part.strip()) > 2]


def _named_in(headline: str, mention: Mention) -> int:
    """How specifically the headline names this place: 2 for the place itself (its first
    name part), 1 for its country or region, 0 if not at all. Whole words or their start
    ("Russia" also matches "Russian"), case-insensitive."""
    parts = _name_parts(mention)
    for score, names in ((2, parts[:1]), (1, parts[1:])):
        for name in names:
            if re.search(r"\b" + re.escape(name), headline, re.I):
                return score
    return 0


_SPECIFICITY = {**dict.fromkeys(CITY_TYPES, 3), **dict.fromkeys(REGION_TYPES, 2), 1: 1}


def _country_level(mentions: list[Mention], fips: str) -> Mention:
    """The article's country-level mention of a country (its centroid), else its first
    mention of anything in that country."""
    same = [m for m in mentions if m.fips == fips]
    return next((m for m in same if m.type in COUNTRY_TYPES), same[0])


def main_place(mentions: list[Mention], headline: str) -> tuple[Mention, bool] | None:
    """The article's main place, and whether it is placed at country level only, or None.

    News is placed only where its headline names a place (GDELT also records adjectives,
    e.g. "German" for Germany, as mentions):
    1. A place the headline names itself (e.g. "Sanaa"): the most specific such place
       (city, then region, then country), the earliest mentioned on ties.
    2. Else a country or region the headline names as part of a place (e.g. "Russian
       diesel" names Russia): that country, at country level.
    3. Else None: the article is not placed on the globe. Guessing from the article's body
       too often picks the wrong country.
    """
    exact = [m for m in mentions if _named_in(headline, m) == 2]
    if exact:
        best = max(exact, key=lambda m: (_SPECIFICITY.get(m.type, 0), -m.offset))
        return best, False
    partial = [m for m in mentions if _named_in(headline, m) == 1]
    if partial:
        return _country_level(mentions, partial[0].fips), True
    return None


def geo_for(mention: Mention, gazetteer: Gazetteer, country_only: bool) -> Geo:
    """The place hierarchy for a GDELT place mention. The coordinates decide the country
    (via the gazetteer), not GDELT's own country code."""
    found = gazetteer.reverse(mention.lat, mention.lng)
    iso2 = (
        found.country_code
        if found and found.country_code
        else gazetteer.iso_from_fips(mention.fips)
    )
    if country_only or mention.type in COUNTRY_TYPES:
        return gazetteer.geo_for_country(iso2, "country")
    first = _name_parts(mention)[0] if _name_parts(mention) else None
    if mention.type in CITY_TYPES:
        if found and found.precision == "city":
            return found
        return gazetteer.geo_for_country(iso2, "city", found.admin1 if found else None, first)
    return gazetteer.geo_for_country(iso2, "region", first)


def parse_rows(text: str, gazetteer: Gazetteer, now: datetime) -> tuple[list[Event], int]:
    """Events from one GKG file's text, and how many allowlisted items had no place."""
    events: dict[str, Event] = {}
    unplaced = 0
    for line in text.splitlines():
        f = line.split("\t")
        if len(f) <= COL_EXTRAS:
            continue
        url = f[COL_URL]
        outlet = outlet_for_url(url)
        if outlet is None:
            continue
        title_match = _TITLE.search(f[COL_EXTRAS])
        title = clean_headline(clean_text(title_match.group(1)) if title_match else "", outlet)
        if len(title) < MIN_TITLE_LENGTH:
            continue
        themes = [t for t in f[COL_THEMES].split(";") if t]
        categories = categorize_news(title, themes)
        if not categories:
            continue
        chosen = main_place(parse_mentions(f[COL_LOCATIONS]), title)
        if chosen is None:
            unplaced += 1
            continue
        mention, country_only = chosen
        geo = geo_for(mention, gazetteer, country_only)
        severity, reason = news_severity(title)
        event_id = "gdelt:" + hashlib.sha1(url.encode()).hexdigest()[:16]
        published = parse_stamp(f[COL_DATE])
        events[event_id] = Event(
            id=event_id,
            title=title,
            place=place_name(geo, mention.name),
            lat=mention.lat,
            lng=mention.lng,
            severity=severity,
            severity_reason=reason,
            categories=categories,
            kind="news",
            feed=ID,
            published=published,
            first_seen=now,
            sources=[Source(outlet.name, url, outlet.state_affiliated)],
            geo=geo,
            location_method="machine-coded",
        )
    return list(events.values()), unplaced


def latest_stamp() -> datetime:
    """The time stamp of GDELT's newest GKG file."""
    text = get(LAST_UPDATE).decode("utf-8")
    for line in text.splitlines():
        if line.endswith(".gkg.csv.zip"):
            return parse_stamp(line.rsplit("/", 1)[-1].split(".")[0])
    raise FetchError("GDELT lastupdate.txt lists no GKG file")


def stamps_to_fetch(cursor: datetime | None, latest: datetime) -> list[datetime]:
    """The 15-minute files after `cursor` up to `latest` (or a backfill), at most MAX_FILES."""
    start = cursor + STEP if cursor else latest - BACKFILL + STEP
    stamps = []
    moment = start
    while moment <= latest:
        stamps.append(moment)
        moment += STEP
    return stamps[-MAX_FILES:]


def read_file(moment: datetime) -> str:
    """Downloads and unzips one GKG file."""
    data = get(FILE_URL.format(stamp=stamp(moment)), timeout=90)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return archive.read(archive.namelist()[0]).decode("utf-8", "replace")


def fetch(
    gazetteer: Gazetteer, now: datetime, cursor: datetime | None
) -> tuple[list[Event], datetime, dict[str, int]]:
    """New events since `cursor`, the new cursor, and counts for feeds.json."""
    latest = latest_stamp()
    events: list[Event] = []
    stats = {"files": 0, "missing_files": 0, "unplaced": 0}
    for index, moment in enumerate(stamps_to_fetch(cursor, latest)):
        if index:
            time.sleep(PAUSE_SECONDS)
        try:
            text = read_file(moment)
        except FetchError:
            stats["missing_files"] += 1
            continue
        found, unplaced = parse_rows(text, gazetteer, now)
        events.extend(found)
        stats["files"] += 1
        stats["unplaced"] += unplaced
    return events, latest, stats
