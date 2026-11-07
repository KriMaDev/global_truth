"""Shared test fixtures: a tiny gazetteer, so tests never need the real GeoNames download."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from globe_pipeline.geocode import City, Gazetteer

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


@pytest.fixture
def now() -> datetime:
    return NOW


@pytest.fixture
def gazetteer() -> Gazetteer:
    cities = [
        City("Sofia", 42.6975, 23.3242, "BG", "42", 1_152_556),
        City("Tokyo", 35.6895, 139.6917, "JP", "40", 8_336_599),
        City("Yoyogi", 35.6833, 139.7, "JP", "40", 20_000),
        City("Sanaa", 15.3547, 44.2067, "YE", "26", 1_937_451),
        City("Valparaiso", -33.0393, -71.6273, "CL", "01", 282_448),
        City("Gaza", 31.5017, 34.4668, "PS", "GZ", 410_000),
    ]
    countries = {
        "BG": {"name": "Bulgaria", "continent": "Europe", "iso3": "BGR", "fips": "BU"},
        "JP": {"name": "Japan", "continent": "Asia", "iso3": "JPN", "fips": "JA"},
        "YE": {"name": "Yemen", "continent": "Asia", "iso3": "YEM", "fips": "YM"},
        "CL": {"name": "Chile", "continent": "South America", "iso3": "CHL", "fips": "CI"},
        "PS": {"name": "Palestinian Territory", "continent": "Asia", "iso3": "PSE", "fips": "GZ"},
        "IL": {"name": "Israel", "continent": "Asia", "iso3": "ISR", "fips": "IS"},
        "RU": {"name": "Russia", "continent": "Europe", "iso3": "RUS", "fips": "RS"},
    }
    admin1 = {
        "BG.42": "Sofia-Capital",
        "JP.40": "Tokyo",
        "YE.26": "Amanat Al Asimah",
        "CL.01": "Valparaiso",
    }
    m49 = {
        "BG": {"region": "Eastern Europe"},
        "JP": {"region": "Eastern Asia"},
        "YE": {"region": "Western Asia"},
        "CL": {"region": "South America"},
        "PS": {"region": "Western Asia"},
        "IL": {"region": "Western Asia"},
        "RU": {"region": "Eastern Europe"},
    }
    return Gazetteer(cities, countries, admin1, m49)
