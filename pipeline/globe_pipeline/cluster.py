"""Grouping duplicates: one story from several outlets becomes one event listing them all.

News rule: the same country, published within 24 hours, and headlines sharing at least 3
meaningful words that make up at least 60% of the shorter headline's words (after removing
stop-words and simple endings, so "killed" and "kills" are the same word).

Data-feed rule: a GDACS earthquake within 30 minutes and 150 km of a USGS earthquake is the
same earthquake. News and data feeds are never merged.

The merged event keeps the earliest report's headline, place and time, lists every source,
takes the highest severity (with its reason) and the union of categories.
"""

from __future__ import annotations

import re
from datetime import timedelta
from functools import lru_cache

from .geocode import distance_km
from .models import Event

NEWS_SIMILARITY = 0.6
NEWS_MIN_SHARED = 3
NEWS_WINDOW = timedelta(hours=24)
QUAKE_WINDOW = timedelta(minutes=30)
QUAKE_DISTANCE_KM = 150.0

STOP_WORDS = frozenset(
    (
        "a an the and or but of to in on at for from by with as is are was were be been has "
        "have had it its this that these those after before over under into amid says said "
        "say new more than about against up down out off will would could may might not no"
    ).split()
)
_WORD = re.compile(r"[a-z0-9]+")


def stem(word: str) -> str:
    """A crude stem: "killed", "kills", "killing" -> "kill"; "houthis" -> "houthi"."""
    for ending in ("ing", "ed", "es", "s"):
        if len(word) > len(ending) + 3 and word.endswith(ending):
            return word[: -len(ending)]
    return word


@lru_cache(maxsize=20_000)
def headline_words(title: str) -> frozenset[str]:
    """The meaningful words of a headline: lower case, stemmed, no stop-words, 3+ letters
    or any number."""
    text = title.lower().replace("'s", "").replace("’s", "")
    return frozenset(
        stem(w) for w in _WORD.findall(text) if w not in STOP_WORDS and (len(w) > 2 or w.isdigit())
    )


def similarity(a: str, b: str) -> tuple[int, float]:
    """Shared words of two headlines, and their share of the shorter headline's words."""
    wa, wb = headline_words(a), headline_words(b)
    if not wa or not wb:
        return 0, 0.0
    shared = len(wa & wb)
    return shared, shared / min(len(wa), len(wb))


def same_story(a: Event, b: Event) -> bool:
    """Whether two events report the same thing (see the module rules)."""
    if a.kind != b.kind:
        return False
    if a.kind == "news":
        if a.geo.country_code != b.geo.country_code or abs(a.published - b.published) > NEWS_WINDOW:
            return False
        shared, share = similarity(a.title, b.title)
        return shared >= NEWS_MIN_SHARED and share >= NEWS_SIMILARITY
    return (
        a.hazard == b.hazard == "EQ"
        and a.feed != b.feed
        and abs(a.published - b.published) <= QUAKE_WINDOW
        and distance_km(a.lat, a.lng, b.lat, b.lng) <= QUAKE_DISTANCE_KM
    )


def merge(primary: Event, other: Event) -> Event:
    """`primary` with `other`'s sources, categories, (if higher) severity and (if it has
    none) disaster type added."""
    urls = {source.url for source in primary.sources}
    primary.sources.extend(s for s in other.sources if s.url not in urls)
    primary.categories = sorted(set(primary.categories) | set(other.categories))
    primary.category_basis = {**other.category_basis, **primary.category_basis}
    if other.severity > primary.severity:
        primary.severity, primary.severity_reason = other.severity, other.severity_reason
    primary.first_seen = min(primary.first_seen, other.first_seen)
    primary.hazard = primary.hazard or other.hazard
    return primary


def _bucket(event: Event) -> tuple:
    """Only events in the same bucket can be the same story (keeps clustering fast)."""
    if event.kind == "news":
        return ("news", event.geo.country_code)
    return ("quake",) if event.hazard == "EQ" else ("feed", event.id)


def cluster(events: list[Event]) -> list[Event]:
    """Merges events that report the same story. The earliest report leads; for earthquakes
    the USGS report leads, since its coordinates and magnitude are the reference."""

    def lead_order(event: Event) -> tuple:
        return (event.feed != "usgs", event.published, event.id)

    merged: list[Event] = []
    buckets: dict[tuple, list[Event]] = {}
    for event in sorted(events, key=lead_order):
        group = buckets.setdefault(_bucket(event), [])
        for existing in group:
            if same_story(existing, event):
                merge(existing, event)
                break
        else:
            group.append(event)
            merged.append(event)
    return merged
