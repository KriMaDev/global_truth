"""GDACS disaster alerts (European Commission JRC and UN OCHA), reused under CC BY 4.0 per the
Commission's reuse policy. Alerts are automated estimates: the card says so and points to
official authorities.

Kept: Orange and Red alerts of every kind, and Green alerts for earthquakes, tropical
cyclones, floods and volcanoes, active within the last 7 days. (Green wildfire and drought
alerts are left out: there are dozens at any time and they would bury everything else.)
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ..geocode import Gazetteer
from ..http import get_json
from ..models import Event, Source, parse_iso
from ..normalize import clean_text
from ..severity import gdacs_severity
from . import REMOTE

ID = "gdacs"
NAME = "GDACS (Global Disaster Alert and Coordination System)"
HOMEPAGE = "https://www.gdacs.org/"
URL = (
    "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
    "?eventlist=EQ;TC;FL;VO;DR;WF&alertlevel=Green;Orange;Red&fromdate={start}&todate={end}"
)
WINDOW = timedelta(days=7)
GREEN_KEPT = frozenset({"EQ", "TC", "FL", "VO"})


def keep(props: dict[str, Any]) -> bool:
    """Whether an alert is shown (see the module rules)."""
    level = str(props.get("alertlevel", "")).lower()
    if level in ("orange", "red"):
        return True
    return level == "green" and props.get("eventtype") in GREEN_KEPT


def _country_from_iso3(gazetteer: Gazetteer, iso3: str) -> str | None:
    return next((iso2 for iso2, c in gazetteer.countries.items() if c.get("iso3") == iso3), None)


def parse(collection: dict[str, Any], gazetteer: Gazetteer, now: datetime) -> list[Event]:
    """Events from the GDACS event-list GeoJSON."""
    events = []
    for feature in collection.get("features", []):
        props = feature["properties"]
        if not keep(props):
            continue
        last_active = parse_iso(props.get("todate") or props["fromdate"])
        if now - last_active > WINDOW:
            continue
        lng, lat = feature["geometry"]["coordinates"][:2]
        severity, reason = gdacs_severity(props["alertlevel"])
        geo = gazetteer.reverse(float(lat), float(lng))
        if geo is None and props.get("iso3"):
            iso2 = _country_from_iso3(gazetteer, props["iso3"])
            geo = gazetteer.geo_for_country(iso2, "country") if iso2 else None
        country_text = clean_text(props.get("country")) or "Off-shore"
        details = (props.get("severitydata") or {}).get("severitytext")
        source_note = f"Data: {props['source']}." if props.get("source") else ""
        events.append(
            Event(
                id=f"gdacs:{props['eventtype']}{props['eventid']}",
                title=clean_text(props.get("name") or props.get("description")),
                snippet=" ".join(
                    p for p in (clean_text(details) + ".", source_note) if p.strip(".")
                ),
                place=country_text,
                lat=float(lat),
                lng=float(lng),
                severity=severity,
                severity_reason=reason,
                categories=["natural-disasters"],
                kind="data-feed",
                feed=ID,
                hazard=props["eventtype"],
                published=parse_iso(props["fromdate"]),
                first_seen=now,
                sources=[Source("GDACS", props["url"]["report"])],
                geo=geo or REMOTE,
                location_method="source",
            )
        )
    return events


def fetch(gazetteer: Gazetteer, now: datetime) -> list[Event]:
    start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    end = now.strftime("%Y-%m-%d")
    return parse(get_json(URL.format(start=start, end=end)), gazetteer, now)
