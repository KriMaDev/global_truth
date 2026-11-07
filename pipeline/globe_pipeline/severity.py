"""Severity: the four-level scale and the documented rules that assign it.

Every rule here is written out in docs/severity.md; change both together, with tests. Each
rule returns the level and a short reason in plain words, shown on the event's card.
"""

from __future__ import annotations

import re
from enum import IntEnum


class Severity(IntEnum):
    """Four ordered severity levels. Higher value means more severe."""

    LOW = 1
    MODERATE = 2
    HIGH = 3
    CRITICAL = 4

    @property
    def label(self) -> str:
        """Lower-case name used in the published JSON, e.g. ``"moderate"``."""
        return self.name.lower()

    @classmethod
    def from_label(cls, label: str) -> Severity:
        """Parse a level from its JSON label, ignoring case and surrounding spaces.

        Raises:
            ValueError: if the label is not one of the four levels.
        """
        try:
            return cls[label.strip().upper()]
        except KeyError:
            valid = ", ".join(level.label for level in cls)
            raise ValueError(f"Unknown severity {label!r}; expected one of: {valid}") from None


# Okabe-Ito colours, colourblind-safe. Keep in sync with docs/severity.md,
# frontend/src/severity.ts and frontend/src/style.css (tests check all of them).
SEVERITY_COLORS: dict[Severity, str] = {
    Severity.LOW: "#56B4E9",
    Severity.MODERATE: "#F0E442",
    Severity.HIGH: "#E69F00",
    Severity.CRITICAL: "#D55E00",
}

Rated = tuple[Severity, str]

# ---------- Earthquakes (USGS) ----------

PAGER_LEVELS = {
    "green": Severity.LOW,
    "yellow": Severity.MODERATE,
    "orange": Severity.HIGH,
    "red": Severity.CRITICAL,
}


def earthquake_severity(magnitude: float, pager_alert: str | None) -> Rated:
    """USGS PAGER alert if given, else magnitude: under 5 low, 5-5.9 moderate, 6-6.9 high,
    7 and above critical."""
    if pager_alert and pager_alert.lower() in PAGER_LEVELS:
        level = PAGER_LEVELS[pager_alert.lower()]
        return level, f"USGS PAGER {pager_alert.lower()} alert (magnitude {magnitude:.1f})"
    if magnitude >= 7:
        level = Severity.CRITICAL
    elif magnitude >= 6:
        level = Severity.HIGH
    elif magnitude >= 5:
        level = Severity.MODERATE
    else:
        level = Severity.LOW
    return level, f"Magnitude {magnitude:.1f} (USGS)"


# ---------- GDACS alerts ----------

GDACS_LEVELS = {"green": Severity.LOW, "orange": Severity.HIGH, "red": Severity.CRITICAL}


def gdacs_severity(alert_level: str) -> Rated:
    """GDACS alert level: Green low, Orange high, Red critical."""
    level = GDACS_LEVELS.get(alert_level.strip().lower())
    if level is None:
        raise ValueError(f"Unknown GDACS alert level {alert_level!r}")
    return level, f"GDACS {alert_level.strip().capitalize()} alert (severity derived from it)"


# ---------- News reports ----------

#: Words for numbers that headlines use instead of digits.
NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "a dozen": 12,
    "dozens": 24,
    "scores": 40,
    "hundreds": 200,
    "thousands": 2000,
}
_NUMBER = r"(\d[\d,]*|" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r")"
_CASUALTY_PATTERNS = (
    # "at least 12 killed", "12 people dead", "dozens of civilians killed", "30 die"
    re.compile(
        _NUMBER
        + r"\s+(?:of\s+)?(?:\w+\s+){0,2}?(?:killed|dead|die[sd]?|deaths|feared dead|lives lost)\b",
        re.I,
    ),
    # "kills 12", "killing at least 30 people"
    re.compile(
        r"\bkill(?:s|ing|ed)\s+(?:at least\s+|more than\s+|over\s+|nearly\s+)?" + _NUMBER, re.I
    ),
    # "death toll rises to 40", "toll climbs to 120"
    re.compile(r"\btoll\s+(?:\w+\s+){0,2}?(?:to|at|of|reaches|hits)\s+" + _NUMBER, re.I),
)

#: Terms that signal a serious, ongoing situation without a casualty count: moderate.
HAZARD_TERMS = (
    "state of emergency",
    "evacuat",
    "martial law",
    "curfew",
    "air strike",
    "airstrike",
    "missile strike",
    "drone strike",
    "shelling",
    "invasion",
    "coup",
    "explosion",
    "outbreak",
    "epidemic",
    "famine",
    "tsunami warning",
    "hostage",
    "massacre",
)


def _to_number(text: str) -> int:
    word = text.lower()
    if word in NUMBER_WORDS:
        return NUMBER_WORDS[word]
    return int(word.replace(",", ""))


def casualties_in(headline: str) -> int | None:
    """The largest number of deaths a headline reports, or None."""
    found = [
        _to_number(match.group(1))
        for pattern in _CASUALTY_PATTERNS
        for match in pattern.finditer(headline)
    ]
    return max(found) if found else None


def news_severity(headline: str) -> Rated:
    """Deaths reported in the headline: 1+ moderate, 10+ high, 100+ critical. Otherwise a
    listed hazard term gives moderate, and anything else is low."""
    deaths = casualties_in(headline)
    if deaths is not None and deaths >= 1:
        if deaths >= 100:
            level = Severity.CRITICAL
        elif deaths >= 10:
            level = Severity.HIGH
        else:
            level = Severity.MODERATE
        return level, f"Headline reports {deaths:,} or more deaths"
    lowered = headline.lower()
    for term in HAZARD_TERMS:
        if term in lowered:
            return Severity.MODERATE, f'Headline mentions "{term.rstrip()}"'
    return Severity.LOW, "No deaths or listed hazard terms in the headline"
