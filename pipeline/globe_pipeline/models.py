"""The event model shared by every source, and its JSON form (docs/architecture.md)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from .severity import Severity

#: Where an event comes from: a verified data feed or a news report.
KINDS = ("data-feed", "news")
#: How the location was found: coordinates from the source, or machine-coded from text.
LOCATION_METHODS = ("source", "machine-coded")
#: How precise the location is.
PRECISIONS = ("city", "region", "country", "remote")


@dataclass(frozen=True)
class Source:
    """One outlet or data provider reporting an event."""

    name: str
    url: str
    state_affiliated: bool = False


@dataclass(frozen=True)
class Geo:
    """Where an event is, as a place hierarchy (for drill-down and the geography view)."""

    continent: str | None
    region: str | None
    country: str | None
    country_code: str | None
    admin1: str | None
    city: str | None
    precision: str


@dataclass
class Event:
    """One event on the globe, possibly reported by several sources."""

    id: str
    title: str
    place: str
    lat: float
    lng: float
    severity: Severity
    severity_reason: str
    categories: list[str]
    kind: str
    feed: str
    published: datetime
    first_seen: datetime
    sources: list[Source]
    geo: Geo
    location_method: str
    snippet: str = ""
    hazard: str | None = None
    #: Where each category came from ("headline", "section:business", "topics",
    #: "sport-section"; see categorize.category_basis). Empty for data feeds.
    category_basis: dict[str, str] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def coverage(self) -> int:
        """How many different outlets or providers report it."""
        return len({source.name for source in self.sources})

    def to_json(self) -> dict[str, Any]:
        """The event as written to events.json."""
        return {
            "id": self.id,
            "title": self.title,
            "snippet": self.snippet,
            "place": self.place,
            "lat": round(self.lat, 4),
            "lng": round(self.lng, 4),
            "severity": self.severity.label,
            "severity_reason": self.severity_reason,
            "categories": self.categories,
            "category_basis": self.category_basis,
            "kind": self.kind,
            "feed": self.feed,
            "hazard": self.hazard,
            "published": iso(self.published),
            "first_seen": iso(self.first_seen),
            "coverage": self.coverage,
            "sources": [asdict(source) for source in self.sources],
            "geo": asdict(self.geo),
            "location_method": self.location_method,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> Event:
        """Reads an event written by to_json (e.g. the previous run's events.json)."""
        return cls(
            id=data["id"],
            title=data["title"],
            snippet=data.get("snippet", ""),
            place=data["place"],
            lat=float(data["lat"]),
            lng=float(data["lng"]),
            severity=Severity.from_label(data["severity"]),
            severity_reason=data.get("severity_reason", ""),
            categories=list(data["categories"]),
            category_basis=dict(data.get("category_basis") or {}),
            kind=data["kind"],
            feed=data["feed"],
            hazard=data.get("hazard"),
            published=parse_iso(data["published"]),
            first_seen=parse_iso(data.get("first_seen", data["published"])),
            sources=[Source(**source) for source in data["sources"]],
            geo=Geo(**data["geo"]),
            location_method=data["location_method"],
        )


def iso(moment: datetime) -> str:
    """UTC time as ISO 8601 with a Z, to the second."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(text: str) -> datetime:
    """Reads ISO 8601 (with Z or an offset, or none, taken as UTC)."""
    moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
