"""Event sources: USGS earthquakes, GDACS disaster alerts and GDELT news (allowlisted outlets)."""

from __future__ import annotations

from ..models import Geo

#: The place hierarchy for a point with no city nearby (open sea, desert, ice).
REMOTE = Geo(None, None, None, None, None, None, "remote")
