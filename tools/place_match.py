"""Finds the Wikidata item for a place Natural Earth gives no ID, without guessing.

A candidate has already matched the place's name and type (the query in build_places.py asks
for that). It must also lie close to where the map draws the place. If several do, the one
with an English Wikipedia article wins, since a major river has one and a namesake stream
usually doesn't. If that still leaves more than one, the place stays unmatched, because a
blank card is better than the wrong river's text.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

EARTH_KM = 6371.0


@dataclass(frozen=True)
class Candidate:
    """A Wikidata item with the right name and type, and one of its positions."""

    qid: str
    lng: float
    lat: float
    has_article: bool = False


def distance_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    """The distance along the Earth's surface between two points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(min(1.0, math.sqrt(a)))


def sole_match(
    points: Sequence[Sequence[float]], candidates: Iterable[Candidate], max_km: float
) -> str | None:
    """The one item within `max_km` of any of the place's points ([lng, lat]), or None."""
    close = [
        candidate
        for candidate in candidates
        if any(
            distance_km(candidate.lng, candidate.lat, point[0], point[1]) <= max_km
            for point in points
        )
    ]
    items = {candidate.qid for candidate in close}
    if len(items) == 1:
        return items.pop()
    with_article = {candidate.qid for candidate in close if candidate.has_article}
    return with_article.pop() if len(with_article) == 1 else None
