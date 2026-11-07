"""Categories: War, Politics, Natural disasters, Economic, Technology advancements, Health &
outbreaks.

Rules (docs/categories.md): data feeds are natural disasters. For news:
1. If the headline contains words from the lists below, the categories of those words apply
   (possibly several).
2. Otherwise the one category with the most GDELT themes for the article applies, if it has
   at least two (ties: the first in the order War, Politics, Natural disasters, Economic,
   Technology, Health).
3. With no category, the item is not shown.
The headline leads because it is what the reader sees; GDELT's themes describe the whole
article, which often touches many subjects.
"""

from __future__ import annotations

import re

CATEGORIES = ("war", "politics", "natural-disasters", "economic", "technology", "health")
#: Distinct matching themes needed when the headline has no listed word.
MIN_THEMES = 2

#: GDELT GKG theme names or prefixes (a trailing "_" means "starts with").
THEMES: dict[str, tuple[str, ...]] = {
    "war": (
        "ARMEDCONFLICT",
        "MILITARY",
        "TERROR",
        "REBELLION",
        "WMD",
        "CEASEFIRE",
        "PEACEKEEPING",
        "SEIGE",
        "WB_2433_CONFLICT_AND_VIOLENCE",
    ),
    "politics": (
        "ELECTION",
        "LEGISLATION",
        "DEMOCRACY",
        "PROTEST",
        "IMPEACHMENT",
        "REFERENDUM",
        "CONSTITUTIONAL",
        "USPEC_POLITICS_GENERAL1",
        "GOV_REFORM",
        "SANCTIONS",
    ),
    "natural-disasters": ("NATURAL_DISASTER", "NATURAL_DISASTER_", "ENV_DROUGHT", "ENV_WILDFIRE"),
    "economic": ("ECON_", "EPU_ECONOMY", "EPU_POLICY", "UNEMPLOYMENT", "WB_1104_MACROECONOMIC"),
    "technology": (
        "SCIENCE",
        "WB_133_INFORMATION_AND_COMMUNICATION_TECHNOLOGIES",
        "CYBER_ATTACK",
        "TECH_",
    ),
    "health": (
        "HEALTH_PANDEMIC",
        "HEALTH_VACCINATION",
        "TAX_DISEASE_",
        "MEDICAL_",
        "WB_621_HEALTH_NUTRITION_AND_POPULATION",
    ),
}

#: Headline words (whole words, case-insensitive).
KEYWORDS: dict[str, tuple[str, ...]] = {
    "war": (
        "war",
        "wars",
        "troops",
        "army",
        "military",
        "airstrike",
        "airstrikes",
        "missile",
        "missiles",
        "drone",
        "drones",
        "shelling",
        "ceasefire",
        "truce",
        "invasion",
        "rebels",
        "militants",
        "insurgents",
        "frontline",
        "front line",
        "offensive",
        "bombing",
        "soldiers",
        "armed conflict",
        "warplanes",
    ),
    "politics": (
        "election",
        "elections",
        "vote",
        "votes",
        "voters",
        "parliament",
        "president",
        "prime minister",
        "government",
        "minister",
        "senate",
        "congress",
        "referendum",
        "coalition",
        "opposition",
        "protest",
        "protests",
        "protesters",
        "sanctions",
        "summit",
        "diplomat",
        "diplomats",
        "treaty",
        "impeachment",
        "cabinet",
        "lawmakers",
    ),
    "natural-disasters": (
        "earthquake",
        "quake",
        "tsunami",
        "hurricane",
        "typhoon",
        "cyclone",
        "tornado",
        "flood",
        "floods",
        "flooding",
        "wildfire",
        "wildfires",
        "bushfire",
        "volcano",
        "eruption",
        "landslide",
        "mudslide",
        "drought",
        "heatwave",
        "heat wave",
        "storm",
        "blizzard",
        "avalanche",
    ),
    "economic": (
        "economy",
        "economic",
        "inflation",
        "recession",
        "gdp",
        "interest rate",
        "interest rates",
        "central bank",
        "stocks",
        "stock market",
        "markets",
        "trade",
        "tariff",
        "tariffs",
        "unemployment",
        "jobs report",
        "budget",
        "debt",
        "currency",
        "oil prices",
        "imf",
        "world bank",
        "exports",
        "imports",
    ),
    "technology": (
        "ai",
        "artificial intelligence",
        "chip",
        "chips",
        "semiconductor",
        "semiconductors",
        "satellite",
        "rocket",
        "spacecraft",
        "space station",
        "quantum",
        "robot",
        "robots",
        "robotics",
        "battery",
        "batteries",
        "fusion",
        "vaccine",
        "gene",
        "genome",
        "cyberattack",
        "software",
        "supercomputer",
        "launch",
        "telescope",
        "breakthrough",
    ),
    # Not "WHO": matching ignores case, so "Who is ..." would count. The full name works.
    "health": (
        "outbreak",
        "outbreaks",
        "epidemic",
        "pandemic",
        "virus",
        "viruses",
        "disease",
        "diseases",
        "infection",
        "infections",
        "cholera",
        "ebola",
        "marburg",
        "mpox",
        "monkeypox",
        "measles",
        "dengue",
        "malaria",
        "polio",
        "covid",
        "covid-19",
        "coronavirus",
        "influenza",
        "flu",
        "bird flu",
        "h5n1",
        "plague",
        "world health organization",
        "vaccination",
        "vaccination campaign",
        "quarantine",
    ),
}

_KEYWORD_PATTERNS = {
    category: re.compile(r"\b(?:" + "|".join(re.escape(w) for w in words) + r")\b", re.I)
    for category, words in KEYWORDS.items()
}


def _theme_matches(theme: str, rule: str) -> bool:
    return theme.startswith(rule) if rule.endswith("_") else theme == rule


def keyword_hits(headline: str) -> dict[str, set[str]]:
    """The listed words found in a headline, per category."""
    return {
        category: {m.group(0).lower() for m in _KEYWORD_PATTERNS[category].finditer(headline)}
        for category in CATEGORIES
    }


def theme_hits(themes: list[str]) -> dict[str, int]:
    """How many distinct GDELT themes match each category."""
    unique = set(themes)
    return {
        category: sum(
            1 for t in unique if any(_theme_matches(t, rule) for rule in THEMES[category])
        )
        for category in CATEGORIES
    }


#: The type of a natural disaster named in a news headline, as a hazard code (GDACS's codes
#: where it has one). The first match in this order wins: a tsunami headline often also says
#: "earthquake", a cyclone one "flood".
HAZARD_WORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("TS", ("tsunami",)),
    ("EQ", ("earthquake", "earthquakes", "quake", "quakes", "aftershock", "aftershocks")),
    ("TC", ("hurricane", "hurricanes", "typhoon", "typhoons", "cyclone", "cyclones")),
    ("VO", ("volcano", "volcanoes", "volcanic", "eruption", "erupts", "erupted")),
    ("WF", ("wildfire", "wildfires", "bushfire", "bushfires", "forest fire", "forest fires")),
    ("FL", ("flood", "floods", "flooding", "flooded", "flash flood", "flash floods")),
    ("LS", ("landslide", "landslides", "mudslide", "mudslides")),
    ("AV", ("avalanche", "avalanches")),
    ("DR", ("drought", "droughts")),
    ("HW", ("heatwave", "heatwaves", "heat wave", "heat waves")),
    ("ST", ("storm", "storms", "tornado", "tornadoes", "blizzard", "blizzards")),
)

_HAZARD_PATTERNS = [
    (code, re.compile(r"\b(?:" + "|".join(re.escape(w) for w in words) + r")\b", re.I))
    for code, words in HAZARD_WORDS
]


def hazard_of(headline: str) -> str | None:
    """The disaster type a headline names (see HAZARD_WORDS), or None."""
    for code, pattern in _HAZARD_PATTERNS:
        if pattern.search(headline):
            return code
    return None


def categorize_news(headline: str, themes: list[str]) -> list[str]:
    """The categories of a news item (possibly several, possibly none)."""
    words = keyword_hits(headline)
    from_headline = [c for c in CATEGORIES if words[c]]
    if from_headline:
        return from_headline
    counts = theme_hits(themes)
    best = max(CATEGORIES, key=lambda c: counts[c])
    return [best] if counts[best] >= MIN_THEMES else []
