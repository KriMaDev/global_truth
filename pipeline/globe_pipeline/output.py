"""Reading the previous run's data and writing the published files.

Published (docs/architecture.md):
- events.json: the last 72 hours (the page's first load stays small);
- days/YYYY-MM-DD.json: every event of one UTC day, for the 7-day timeline;
- days/index.json: the days available, with counts;
- feeds.json: each source's health, and GDELT's cursor;
- outlets.json: every allowlisted outlet (country, region, ownership, events in the 7 days)
  and the data-feed providers with their credit lines, for the source lines on cards.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .http import FetchError, get
from .models import Event, iso, parse_iso
from .outlets import outlets_document
from .severity import Severity

#: How long events are kept (the timeline's reach).
WINDOW = timedelta(days=7)
#: What events.json holds: the default view's time window.
RECENT = timedelta(hours=72)


@dataclass
class FeedStatus:
    """One source's health, published in feeds.json (shown as "last updated")."""

    id: str
    name: str
    kind: str
    homepage: str
    status: str = "ok"
    last_attempt: str | None = None
    last_success: str | None = None
    count: int = 0
    note: str | None = None
    stats: dict[str, int] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        data = {k: v for k, v in self.__dict__.items() if v not in (None, {})}
        return data


@dataclass
class Previous:
    """What the last run published."""

    events: list[Event] = field(default_factory=list)
    feeds: dict[str, dict[str, Any]] = field(default_factory=dict)
    gdelt_cursor: datetime | None = None


def _read(location: str, name: str) -> Any | None:
    """A JSON file from a URL prefix or a local folder, or None if it isn't there."""
    try:
        if location.startswith(("http://", "https://")):
            return json.loads(get(location.rstrip("/") + "/" + name, retries=1))
        path = Path(location) / name
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    except (FetchError, json.JSONDecodeError, OSError):
        return None


def _events_of(doc: Any) -> list[Event]:
    """The events in a published file; damaged entries are skipped."""
    events = []
    for data in (doc or {}).get("events", []):
        try:
            events.append(Event.from_json(data))
        except (KeyError, TypeError, ValueError):
            continue
    return events


def load_previous(location: str | None) -> Previous:
    """The previously published events (all days listed in days/index.json, or events.json
    when there are no day files yet) and feeds.json."""
    if not location:
        return Previous()
    previous = Previous()
    index = _read(location, "days/index.json")
    by_id: dict[str, Event] = {}
    if index and isinstance(index.get("days"), list):
        for day in index["days"]:
            name = day.get("file") if isinstance(day, dict) else None
            if isinstance(name, str) and name.endswith(".json") and "/" not in name:
                for event in _events_of(_read(location, f"days/{name}")):
                    by_id[event.id] = event
    for event in _events_of(_read(location, "events.json")):
        by_id.setdefault(event.id, event)
    previous.events = list(by_id.values())
    feeds = _read(location, "feeds.json") or {}
    previous.feeds = {feed["id"]: feed for feed in feeds.get("feeds", []) if "id" in feed}
    if feeds.get("gdelt_cursor"):
        try:
            previous.gdelt_cursor = parse_iso(feeds["gdelt_cursor"])
        except ValueError:
            previous.gdelt_cursor = None
    return previous


def within_window(events: list[Event], now: datetime, window: timedelta = WINDOW) -> list[Event]:
    """Events published within `window` before `now` (7 days by default)."""
    return [event for event in events if now - event.published <= window]


def order(events: list[Event]) -> list[Event]:
    """Most severe first, then newest."""
    return sorted(events, key=lambda e: (-int(e.severity), -e.published.timestamp(), e.id))


def _counts(events: list[Event]) -> dict[str, int]:
    counts = {level.label: 0 for level in Severity}
    for event in events:
        counts[event.severity.label] += 1
    return counts


def _write_json(path: Path, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def day_of(event: Event) -> str:
    """The UTC date an event was published, e.g. "2026-11-08"."""
    return event.published.astimezone(UTC).strftime("%Y-%m-%d")


def write(
    out: Path,
    events: list[Event],
    feeds: list[FeedStatus],
    now: datetime,
    gdelt_cursor: datetime | None,
    providers: list[dict[str, str]] | None = None,
) -> None:
    """Writes events.json, the day files and their index, feeds.json and outlets.json to
    `out`. `providers`: the data feeds' source names, credit lines and homepages."""
    out.mkdir(parents=True, exist_ok=True)
    generated = iso(now)

    recent = within_window(events, now, RECENT)
    _write_json(
        out / "events.json",
        {
            "generated": generated,
            "window_hours": int(RECENT.total_seconds() // 3600),
            "counts": _counts(recent),
            "events": [event.to_json() for event in order(recent)],
        },
    )

    by_day: dict[str, list[Event]] = {}
    for event in events:
        by_day.setdefault(day_of(event), []).append(event)
    days_dir = out / "days"
    for stale in days_dir.glob("*.json") if days_dir.exists() else []:
        if stale.name != "index.json" and stale.stem not in by_day:
            stale.unlink()
    for day, day_events in by_day.items():
        _write_json(
            days_dir / f"{day}.json",
            {
                "generated": generated,
                "day": day,
                "events": [e.to_json() for e in order(day_events)],
            },
        )
    _write_json(
        days_dir / "index.json",
        {
            "generated": generated,
            "window_hours": int(WINDOW.total_seconds() // 3600),
            "days": [
                {"day": day, "file": f"{day}.json", "count": len(by_day[day])}
                for day in sorted(by_day, reverse=True)
            ],
        },
    )

    _write_json(
        out / "feeds.json",
        {
            "generated": generated,
            "feeds": [feed.to_json() for feed in feeds],
            "gdelt_cursor": iso(gdelt_cursor) if gdelt_cursor else None,
        },
    )

    _write_json(
        out / "outlets.json",
        {
            "generated": generated,
            "window_hours": int(WINDOW.total_seconds() // 3600),
            "outlets": outlets_document([s.name for s in e.sources] for e in events),
            "providers": providers or [],
        },
    )
