"""Reading the previous run's data and writing events.json and feeds.json."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .http import FetchError, get
from .models import Event, iso, parse_iso
from .severity import Severity

WINDOW = timedelta(hours=72)


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


def load_previous(location: str | None) -> Previous:
    """The previous events.json and feeds.json, if any; damaged entries are skipped."""
    if not location:
        return Previous()
    previous = Previous()
    events = _read(location, "events.json")
    for data in (events or {}).get("events", []):
        try:
            previous.events.append(Event.from_json(data))
        except (KeyError, TypeError, ValueError):
            continue
    feeds = _read(location, "feeds.json") or {}
    previous.feeds = {feed["id"]: feed for feed in feeds.get("feeds", []) if "id" in feed}
    if feeds.get("gdelt_cursor"):
        try:
            previous.gdelt_cursor = parse_iso(feeds["gdelt_cursor"])
        except ValueError:
            previous.gdelt_cursor = None
    return previous


def within_window(events: list[Event], now: datetime) -> list[Event]:
    """Events published in the last 72 hours."""
    return [event for event in events if now - event.published <= WINDOW]


def order(events: list[Event]) -> list[Event]:
    """Most severe first, then newest."""
    return sorted(events, key=lambda e: (-int(e.severity), -e.published.timestamp(), e.id))


def write(
    out: Path,
    events: list[Event],
    feeds: list[FeedStatus],
    now: datetime,
    gdelt_cursor: datetime | None,
) -> None:
    """Writes events.json and feeds.json to `out`."""
    out.mkdir(parents=True, exist_ok=True)
    counts = {level.label: 0 for level in Severity}
    for event in events:
        counts[event.severity.label] += 1
    events_doc = {
        "generated": iso(now),
        "window_hours": int(WINDOW.total_seconds() // 3600),
        "counts": counts,
        "events": [event.to_json() for event in order(events)],
    }
    feeds_doc = {
        "generated": iso(now),
        "feeds": [feed.to_json() for feed in feeds],
        "gdelt_cursor": iso(gdelt_cursor) if gdelt_cursor else None,
    }
    for name, doc in (("events.json", events_doc), ("feeds.json", feeds_doc)):
        tmp = out / (name + ".tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(out / name)
