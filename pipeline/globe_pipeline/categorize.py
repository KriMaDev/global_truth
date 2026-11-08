"""Categories: War, Politics, Natural disasters, Economic, Technology advancements, Health &
outbreaks, Climate & environment, Crime & justice, Humanitarian & migration, Science & space,
Sport (the last five added 8 Nov 2026 after a review of what people search for).

Rules (docs/categories.md): data feeds are natural disasters. For news:
1. An article in an outlet's sport section is Sport, and only Sport.
2. Otherwise the outlet's own section in the web address (SECTION_CATEGORIES) and the words
   of the headline (KEYWORDS) both apply: every category either gives.
3. If neither gives one, the one category with the most GDELT themes for the article
   applies, if it has at least two (ties: the first in the order of CATEGORIES). Tested on
   8 Nov 2026: letting themes add categories next to the headline mostly added wrong ones.
4. With no category, the item is not shown.
The headline leads because it is what the reader sees; GDELT's themes describe the whole
article, which often touches many subjects.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

CATEGORIES = (
    "war",
    "politics",
    "natural-disasters",
    "economic",
    "technology",
    "health",
    "climate",
    "crime",
    "humanitarian",
    "science",
    "sport",
)
#: Hidden until the visitor turns them on (the site's filters), so they don't crowd the globe.
OFF_BY_DEFAULT = ("sport",)
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
    # Not ENV_* as a whole: it also covers oil, mining, coal and gas.
    "climate": (
        "ENV_CLIMATECHANGE",
        "WB_567_CLIMATE_CHANGE",
        "UNGP_CLIMATE_CHANGE_ACTION",
        "ENV_GREEN",
        "ENV_DEFORESTATION",
        "ENV_SPECIESENDANGERED",
        "ENV_POACHING",
        "MOVEMENT_ENVIRONMENTAL",
        "WB_601_POLLUTION_MANAGEMENT",
        "WB_1791_AIR_POLLUTION",
        "WB_1798_WATER_POLLUTION",
        "WB_1984_OCEAN_POLLUTION",
    ),
    # Not KILL: it is in most war reports too.
    "crime": (
        "SOC_GENERALCRIME",
        "CRIME_",
        "ARREST",
        "TRIAL",
        "WB_1014_CRIMINAL_JUSTICE",
        "UNGP_CRIME_VIOLENCE",
        "CORRUPTION",
        "DRUG_TRADE",
        "KIDNAP",
        "ASSASSINATION",
        "HUMAN_TRAFFICKING",
    ),
    "humanitarian": (
        "REFUGEES",
        "DISPLACED",
        "IMMIGRATION",
        "WB_2837_IMMIGRATION",
        "EPU_CATS_MIGRATION_FEAR_MIGRATION",
        "FOOD_SECURITY",
        "SELF_IDENTIFIED_HUMANITARIAN_CRISIS",
        "AID_HUMANITARIAN",
    ),
    "science": ("SCIENCE", "TAX_FNCACT_ASTRONOMER"),
    # GDELT has no sport theme: sport comes from the sport sections and headline words.
    "sport": (),
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
        "quantum",
        "robot",
        "robots",
        "robotics",
        "battery",
        "batteries",
        "vaccine",
        "cyberattack",
        "software",
        "supercomputer",
        "launch",
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
    # Not "COP" alone (also slang for police): the numbered summits and "climate summit".
    "climate": (
        "climate",
        "climate change",
        "global warming",
        "emissions",
        "carbon",
        "net zero",
        "net-zero",
        "greenhouse gas",
        "greenhouse gases",
        "cop29",
        "cop30",
        "cop31",
        "cop32",
        "climate summit",
        "pollution",
        "polluted",
        "deforestation",
        "biodiversity",
        "glacier",
        "glaciers",
        "sea level",
        "sea levels",
        "renewable",
        "renewables",
        "coral",
        "coral reef",
        "endangered species",
        "extinction",
        "fossil fuel",
        "fossil fuels",
        "hottest year",
        "heat record",
        "environmental",
    ),
    # Not "trial" alone (clinical trials) or "investigation" (crashes, inquiries).
    "crime": (
        "murder",
        "murdered",
        "murders",
        "homicide",
        "assassination",
        "assassinated",
        "shooting",
        "shootings",
        "gunman",
        "gunmen",
        "stabbing",
        "stabbed",
        "arrest",
        "arrested",
        "arrests",
        "charged",
        "indicted",
        "indictment",
        "on trial",
        "stands trial",
        "goes on trial",
        "verdict",
        "sentenced",
        "convicted",
        "acquitted",
        "court",
        "supreme court",
        "prosecutor",
        "prosecutors",
        "police",
        "fraud",
        "corruption",
        "bribery",
        "kidnapping",
        "kidnapped",
        "abducted",
        "trafficking",
        "smuggling",
        "cartel",
        "cartels",
        "gang",
        "gangs",
        "extradition",
        "extradited",
        "jailed",
        "prison",
        "robbery",
        "heist",
    ),
    # Not "aid" alone ("military aid"): the humanitarian forms.
    "humanitarian": (
        "refugee",
        "refugees",
        "migrant",
        "migrants",
        "migration",
        "asylum",
        "asylum seekers",
        "displaced",
        "displacement",
        "famine",
        "hunger",
        "starvation",
        "malnutrition",
        "humanitarian",
        "humanitarian aid",
        "aid convoy",
        "aid workers",
        "aid trucks",
        "food aid",
        "food crisis",
        "food insecurity",
        "unhcr",
        "unrwa",
        "world food programme",
        "deportation",
        "deportations",
        "deported",
    ),
    # Moved from Technology on 8 Nov 2026: satellite, rocket, spacecraft, space station,
    # telescope, gene, genome, fusion.
    "science": (
        "satellite",
        "satellites",
        "rocket",
        "spacecraft",
        "space station",
        "telescope",
        "gene",
        "genes",
        "genome",
        "fusion",
        "space",
        "nasa",
        "esa",
        "isro",
        "mars",
        "moon",
        "lunar",
        "asteroid",
        "comet",
        "astronaut",
        "astronauts",
        "astronomers",
        "galaxy",
        "black hole",
        "exoplanet",
        "scientists",
        "researchers",
        "study finds",
        "new study",
        "fossils",
        "dinosaur",
        "species",
        "physics",
    ),
    "sport": (
        "world cup",
        "olympics",
        "olympic",
        "paralympics",
        "premier league",
        "champions league",
        "la liga",
        "bundesliga",
        "serie a",
        "fifa",
        "uefa",
        "nba",
        "nfl",
        "mlb",
        "nhl",
        "cricket",
        "rugby",
        "tennis",
        "wimbledon",
        "grand slam",
        "formula 1",
        "formula one",
        "grand prix",
        "tour de france",
        "super bowl",
        "footballer",
        "golf",
        "boxing",
        "ufc",
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


#: The outlet's own section, from a folder name in the article's web address (a whole path
#: segment, not the article's own name): the outlet's editorial label, so it leads. Only
#: topical names; most addresses name places (e.g. /canada/toronto/), which say nothing.
#: Seen in GDELT's data on 8 Nov 2026 (Guardian, Straits Times, Premium Times, Anadolu
#: Agency, The Hindu) or the outlets' standard section names.
SECTION_CATEGORIES: dict[str, str] = {
    "business": "economic",
    "economy": "economic",
    "politics": "politics",
    "environment": "climate",
    "climate-crisis": "climate",
    "energy-and-environment": "climate",
    "science": "science",
    "technology": "technology",
    "tech": "technology",
    "science-technology": "technology",
    "health": "health",
    "law": "crime",
    "crime": "crime",
    "courts-crime": "crime",
    "global-development": "humanitarian",
}

#: Where a category came from, shown on the event's card.
BASIS_SPORT_SECTION = "sport-section"
BASIS_HEADLINE = "headline"
BASIS_TOPICS = "topics"
SECTION_PREFIX = "section:"


def section_categories(url: str) -> dict[str, str]:
    """The categories of the outlet's sections in `url`'s folders, each with its section name
    ({"economic": "business"}). The last part of the path (the article itself) is ignored."""
    folders = [part for part in urlsplit(url).path.lower().split("/") if part][:-1]
    found: dict[str, str] = {}
    for folder in folders:
        category = SECTION_CATEGORIES.get(folder)
        if category and category not in found:
            found[category] = folder
    return found


def category_basis(
    headline: str, themes: list[str], url: str = "", sport_page: bool = False
) -> dict[str, str]:
    """The categories of a news item, each with where it came from: "section:<name>" (the
    outlet's own section), "headline" (listed words), "topics" (GDELT's topics for the whole
    article, only when the first two give nothing) or "sport-section". Ordered as CATEGORIES;
    empty when the item fits none.

    An article from an outlet's sport section is Sport only: sport headlines are full of words
    like "offensive", "attack" or "storm" that mean something else elsewhere."""
    if sport_page:
        return {"sport": BASIS_SPORT_SECTION}
    sections = section_categories(url) if url else {}
    words = keyword_hits(headline)
    found = {
        c: SECTION_PREFIX + sections[c] if c in sections else BASIS_HEADLINE
        for c in CATEGORIES
        if c in sections or words[c]
    }
    if found:
        return found
    counts = theme_hits(themes)
    best = max(CATEGORIES, key=lambda c: counts[c])
    return {best: BASIS_TOPICS} if counts[best] >= MIN_THEMES else {}


def categorize_news(
    headline: str, themes: list[str], sport_page: bool = False, url: str = ""
) -> list[str]:
    """The categories of a news item (possibly several, possibly none); see category_basis."""
    return list(category_basis(headline, themes, url, sport_page))
