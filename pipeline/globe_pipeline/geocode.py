"""Reverse geocoding: coordinates or a country code to a place hierarchy.

Continent → region (UN M49) → country → province/state (admin1) → city, from the gazetteer
built by pipeline/tools/build_gazetteer.py (GeoNames, CC BY 4.0, and UN M49). Offline and
pure Python: a 1-degree grid finds the nearest city quickly.
"""

from __future__ import annotations

import gzip
import json
import math
import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .models import Geo

DEFAULT_PATH = Path(__file__).resolve().parents[2] / ".cache" / "gazetteer" / "gazetteer.json.gz"
EARTH_RADIUS_KM = 6371.0
#: A point within this distance of a city is placed at that city.
CITY_RADIUS_KM = 75.0
#: Within this distance the most populous place wins (a metropolis over its districts).
METRO_RADIUS_KM = 30.0
#: Within this distance the nearest city's province and country are used; further away the
#: point is "remote" (open sea, desert, ice) and keeps the source's own place text.
NEAR_RADIUS_KM = 250.0


@dataclass(frozen=True)
class City:
    name: str
    lat: float
    lng: float
    country_code: str
    admin1_code: str
    population: int


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


class Gazetteer:
    """Countries, provinces and cities, with a nearest-city search."""

    def __init__(
        self,
        cities: list[City],
        countries: dict[str, dict],
        admin1: dict[str, str],
        m49: dict[str, dict],
    ) -> None:
        self.cities = cities
        self.countries = countries
        self.admin1 = admin1
        self.m49 = m49
        self._fips = {info["fips"]: iso for iso, info in countries.items() if info.get("fips")}
        self._grid: dict[tuple[int, int], list[City]] = defaultdict(list)
        for city in cities:
            self._grid[(math.floor(city.lat), math.floor(city.lng))].append(city)

    @classmethod
    def load(cls, path: Path | None = None) -> Gazetteer:
        """Reads the built gazetteer (path from GAZETTEER_PATH, or .cache/gazetteer/)."""
        path = path or Path(os.environ.get("GAZETTEER_PATH", DEFAULT_PATH))
        with gzip.open(path, "rt", encoding="utf-8") as file:
            data = json.load(file)
        cities = [City(*row) for row in data["cities"]]
        return cls(cities, data["countries"], data["admin1"], data["m49"])

    def iso_from_fips(self, fips: str) -> str | None:
        """The ISO 3166 code for a FIPS 10-4 country code (as GDELT uses)."""
        return self._fips.get(fips)

    def country_name(self, iso2: str | None) -> str | None:
        info = self.countries.get(iso2 or "")
        return info["name"] if info else None

    def cities_within(self, lat: float, lng: float, max_km: float) -> list[tuple[City, float]]:
        """Every city within `max_km`, with its distance."""
        found: list[tuple[City, float]] = []
        cell_lat, cell_lng = math.floor(lat), math.floor(lng)
        # One degree of latitude is about 111 km; widen the longitude search near the poles.
        reach_lat = int(max_km / 111) + 1
        reach_lng = min(180, int(max_km / max(111 * math.cos(math.radians(lat)), 1)) + 1)
        for dlat in range(-reach_lat, reach_lat + 1):
            for dlng in range(-reach_lng, reach_lng + 1):
                key_lng = (cell_lng + dlng + 180) % 360 - 180
                for city in self._grid.get((cell_lat + dlat, key_lng), ()):
                    km = distance_km(lat, lng, city.lat, city.lng)
                    if km <= max_km:
                        found.append((city, km))
        return found

    def nearest_city(self, lat: float, lng: float, max_km: float) -> tuple[City, float] | None:
        """The nearest city within `max_km`, with its distance, or None."""
        found = self.cities_within(lat, lng, max_km)
        return min(found, key=lambda pair: pair[1]) if found else None

    def city_at(self, lat: float, lng: float) -> tuple[City, float] | None:
        """The city a point belongs to: the most populous place within 30 km (so central
        Tokyo is Tokyo, not one of its districts), else the nearest within 75 km."""
        found = self.cities_within(lat, lng, CITY_RADIUS_KM)
        close = [pair for pair in found if pair[1] <= METRO_RADIUS_KM]
        if close:
            return max(close, key=lambda pair: pair[0].population)
        return min(found, key=lambda pair: pair[1]) if found else None

    def geo_for_country(
        self,
        iso2: str | None,
        precision: str,
        admin1: str | None = None,
        city: str | None = None,
    ) -> Geo:
        """The place hierarchy for a country (continent and region from its code)."""
        info = self.countries.get(iso2 or "")
        region = self.m49.get(iso2 or "", {}).get("region")
        return Geo(
            continent=info["continent"] if info else None,
            region=region,
            country=info["name"] if info else None,
            country_code=iso2 if info else None,
            admin1=admin1,
            city=city,
            precision=precision,
        )

    def reverse(self, lat: float, lng: float) -> Geo | None:
        """The place at a point, or None when it is remote (no city within 250 km)."""
        at_city = self.city_at(lat, lng)
        if at_city is not None:
            city = at_city[0]
            admin1 = self.admin1.get(f"{city.country_code}.{city.admin1_code}")
            return self.geo_for_country(city.country_code, "city", admin1, city.name)
        found = self.nearest_city(lat, lng, NEAR_RADIUS_KM)
        if found is None:
            return None
        city = found[0]
        admin1 = self.admin1.get(f"{city.country_code}.{city.admin1_code}")
        return self.geo_for_country(city.country_code, "region", admin1)


def place_name(geo: Geo, fallback: str) -> str:
    """A readable place for the card: "City, Country", "Province, Country", or the fallback."""
    if geo.precision == "city" and geo.city and geo.country:
        return f"{geo.city}, {geo.country}"
    if geo.precision == "region" and geo.admin1 and geo.country:
        return f"{geo.admin1}, {geo.country}"
    if geo.country and geo.precision in ("country", "region"):
        return geo.country
    return fallback
