"""USGS earthquakes: magnitude 4.5+ and "significant" earthquakes of the past week, kept for
7 days. Public domain; credit "U.S. Geological Survey"."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from ..geocode import Gazetteer
from ..http import get_json
from ..models import Event, Source
from ..severity import earthquake_severity
from . import REMOTE

ID = "usgs"
NAME = "USGS Earthquake Hazards Program"
HOMEPAGE = "https://earthquake.usgs.gov/earthquakes/feed/"
#: The source name on events, and the credit the provider asks for (docs/sources.md).
SOURCE = "USGS"
CREDIT = "U.S. Geological Survey"
FEEDS = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson",
)
WINDOW = timedelta(days=7)


def _snippet(props: dict[str, Any], depth_km: float) -> str:
    parts = [f"Magnitude {props['mag']:.1f}", f"depth {depth_km:.0f} km"]
    if props.get("tsunami"):
        parts.append("USGS tsunami flag set: check official tsunami warning centres")
    return ", ".join(parts) + "."


def parse(collections: list[dict[str, Any]], gazetteer: Gazetteer, now: datetime) -> list[Event]:
    """Events from USGS GeoJSON feature collections (duplicates across feeds removed)."""
    events: dict[str, Event] = {}
    for collection in collections:
        for feature in collection.get("features", []):
            props = feature["properties"]
            if (
                feature["id"] in events
                or props.get("type") != "earthquake"
                or props.get("mag") is None
            ):
                continue
            published = datetime.fromtimestamp(props["time"] / 1000, tz=UTC)
            if now - published > WINDOW:
                continue
            lng, lat, depth = feature["geometry"]["coordinates"][:3]
            severity, reason = earthquake_severity(float(props["mag"]), props.get("alert"))
            events[feature["id"]] = Event(
                id=f"usgs:{feature['id']}",
                title=props["title"],
                snippet=_snippet(props, float(depth or 0)),
                place=props.get("place") or "Unknown location",
                lat=float(lat),
                lng=float(lng),
                severity=severity,
                severity_reason=reason,
                categories=["natural-disasters"],
                kind="data-feed",
                feed=ID,
                hazard="EQ",
                published=published,
                first_seen=now,
                sources=[Source(SOURCE, props["url"])],
                geo=gazetteer.reverse(float(lat), float(lng)) or REMOTE,
                location_method="source",
            )
    return list(events.values())


def fetch(gazetteer: Gazetteer, now: datetime) -> list[Event]:
    return parse([get_json(url) for url in FEEDS], gazetteer, now)
