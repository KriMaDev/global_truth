"""Severity and category rules: every rule and its boundaries (docs/severity.md and
docs/categories.md describe them)."""

import re
from pathlib import Path

import pytest

from globe_pipeline.categorize import (
    CATEGORIES,
    HAZARD_WORDS,
    categorize_news,
    category_basis,
    hazard_of,
    section_categories,
)
from globe_pipeline.severity import (
    Severity,
    casualties_in,
    earthquake_severity,
    gdacs_severity,
    news_severity,
)

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("magnitude", "expected"),
    [
        (4.5, Severity.LOW),
        (4.99, Severity.LOW),
        (5.0, Severity.MODERATE),
        (5.99, Severity.MODERATE),
        (6.0, Severity.HIGH),
        (6.99, Severity.HIGH),
        (7.0, Severity.CRITICAL),
        (8.3, Severity.CRITICAL),
    ],
)
def test_earthquake_magnitude_bands(magnitude: float, expected: Severity) -> None:
    level, reason = earthquake_severity(magnitude, None)
    assert level == expected
    assert "USGS" in reason


@pytest.mark.parametrize(
    ("alert", "expected"),
    [
        ("green", Severity.LOW),
        ("yellow", Severity.MODERATE),
        ("orange", Severity.HIGH),
        ("red", Severity.CRITICAL),
    ],
)
def test_pager_alert_overrides_magnitude(alert: str, expected: Severity) -> None:
    level, reason = earthquake_severity(7.5, alert)
    assert level == expected
    assert "PAGER" in reason


@pytest.mark.parametrize(
    ("level", "expected"),
    [("Green", Severity.LOW), ("Orange", Severity.HIGH), ("Red", Severity.CRITICAL)],
)
def test_gdacs_levels(level: str, expected: Severity) -> None:
    assert gdacs_severity(level)[0] == expected


def test_gdacs_unknown_level_is_an_error() -> None:
    with pytest.raises(ValueError):
        gdacs_severity("Purple")


@pytest.mark.parametrize(
    ("headline", "deaths"),
    [
        ("At least 12 killed in market blast", 12),
        ("Airstrike kills 22 people near capital", 22),
        ("Death toll rises to 1,250 after quake", 1250),
        ("Dozens killed as crisis mounts", 24),
        ("Hundreds feared dead after ferry sinks", 200),
        ("Three dead after storm", 3),
        ("Floods leave 40 dead", 40),
        ("Parliament passes budget", None),
        ("Police kill time before protest", None),
    ],
)
def test_casualties_in_headlines(headline: str, deaths: int | None) -> None:
    assert casualties_in(headline) == deaths


@pytest.mark.parametrize(
    ("headline", "expected"),
    [
        ("Three dead after storm", Severity.MODERATE),
        ("Nine killed in attack", Severity.MODERATE),
        ("At least 10 killed in attack", Severity.HIGH),
        ("99 dead after floods", Severity.HIGH),
        ("Death toll rises to 100", Severity.CRITICAL),
        ("State of emergency declared as river rises", Severity.MODERATE),
        ("Thousands evacuated ahead of cyclone", Severity.MODERATE),
        ("Central bank holds interest rates", Severity.LOW),
    ],
)
def test_news_severity(headline: str, expected: Severity) -> None:
    level, reason = news_severity(headline)
    assert level == expected
    assert reason


def test_reasons_quote_the_headline() -> None:
    assert news_severity("Airstrike kills 22 people")[1] == "Headline reports 22 deaths"
    assert news_severity("Three dead after storm")[1] == "Headline reports three deaths"
    assert news_severity("Dozens killed as crisis mounts")[1] == (
        'Headline reports "Dozens" of deaths (counted as 24)'
    )


def test_headline_words_decide_categories() -> None:
    assert categorize_news(
        "Troops advance as ceasefire collapses", ["ECON_INFLATION", "ECON_TAXATION"]
    ) == ["war"]
    assert categorize_news("Election results delayed as floods hit polling stations", []) == [
        "politics",
        "natural-disasters",
    ]


def test_themes_give_one_category_when_the_headline_has_no_listed_word() -> None:
    themes = ["ARMEDCONFLICT", "MILITARY", "ECON_STOCKMARKET"]
    assert categorize_news("What next for the region?", themes) == ["war"]


def test_one_theme_alone_is_not_enough() -> None:
    assert categorize_news("What next for the region?", ["ECON_STOCKMARKET"]) == []


def test_health_and_outbreaks() -> None:
    assert categorize_news("Cholera outbreak spreads in coastal provinces", []) == ["health"]
    assert categorize_news("Bird flu found on second farm", []) == ["health"]
    assert categorize_news(
        "What experts say about the new variant", ["HEALTH_PANDEMIC", "TAX_DISEASE_CORONAVIRUS"]
    ) == ["health"]
    # "Who is ..." is not the World Health Organization.
    assert "health" not in categorize_news("Who is the new prime minister?", [])
    assert news_severity("WHO declares a pandemic")[0] == Severity.MODERATE


@pytest.mark.parametrize(
    ("headline", "expected"),
    [
        ("Sample: COP31 talks run late over emissions targets", ["climate"]),
        ("Sample: glaciers shrink faster than forecast", ["climate"]),
        ("Sample: gunman arrested after shooting at market", ["crime"]),
        ("Sample: former mayor sentenced for fraud", ["crime"]),
        ("Sample: refugees cross the border as famine spreads", ["humanitarian"]),
        ("Sample: aid convoy reaches the city", ["humanitarian"]),
        ("Sample: astronauts return from the space station", ["science"]),
        ("Sample: telescope spots a distant galaxy", ["science"]),
        ("Sample: Olympics host city named", ["sport"]),
        ("Sample: parliament votes on World Cup stadium funding", ["politics", "sport"]),
    ],
)
def test_new_categories_from_headline_words(headline: str, expected: list[str]) -> None:
    assert categorize_news(headline, []) == expected


def test_science_moved_out_of_technology() -> None:
    assert categorize_news("Sample: rocket carries a new satellite", []) == ["science"]
    assert categorize_news("Sample: new AI chips unveiled", []) == ["technology"]


def test_new_categories_avoid_ambiguous_words() -> None:
    # A clinical trial is not a court case, military aid is not humanitarian aid.
    assert "crime" not in categorize_news("Sample: vaccine trial shows strong results", [])
    assert "humanitarian" not in categorize_news("Sample: military aid package approved", [])


def test_new_categories_from_themes() -> None:
    assert categorize_news(
        "Sample: what next?", ["ENV_CLIMATECHANGE", "WB_567_CLIMATE_CHANGE"]
    ) == ["climate"]
    assert categorize_news("Sample: what next?", ["SOC_GENERALCRIME", "ARREST", "KILL"]) == [
        "crime"
    ]
    assert categorize_news("Sample: what next?", ["REFUGEES", "DISPLACED"]) == ["humanitarian"]
    # Oil and mining are ENV_ themes too, but not climate.
    assert categorize_news("Sample: what next?", ["ENV_OIL", "ENV_MINING"]) == []


def test_sport_section_is_sport_only() -> None:
    # Sport headlines use words that mean something else elsewhere.
    headline = "Sample: striker's offensive display storms past the defence"
    assert categorize_news(headline, ["MILITARY", "ARMEDCONFLICT"], sport_page=True) == ["sport"]
    assert "war" in categorize_news(headline, [])


def test_outlet_section_in_the_address_leads() -> None:
    url = "https://www.theguardian.com/business/2026/nov/08/sample-story"
    assert section_categories(url) == {"economic": "business"}
    # The section and the headline words both count, each with its basis.
    basis = category_basis("Sample: minister defends the plan", [], url)
    assert basis == {"politics": "headline", "economic": "section:business"}
    # Topics are not used when the section gives a category.
    assert category_basis("Sample: what next?", ["ARMEDCONFLICT", "MILITARY"], url) == {
        "economic": "section:business"
    }


def test_only_folders_count_not_the_article_name() -> None:
    assert section_categories("https://www.dw.com/en/health/a-123") == {"health": "health"}
    assert section_categories("https://example.com/news/business") == {}
    # Place folders say nothing.
    assert section_categories("https://www.cbc.ca/news/canada/toronto/story-1") == {}


def test_basis_of_headline_topics_and_sport() -> None:
    assert category_basis("Sample: refugees reach the coast", []) == {"humanitarian": "headline"}
    assert category_basis("Sample: what next?", ["REFUGEES", "DISPLACED"]) == {
        "humanitarian": "topics"
    }
    assert category_basis("Sample: a big win", [], sport_page=True) == {"sport": "sport-section"}


def test_categories_match_the_site() -> None:
    types = (ROOT / "frontend" / "src" / "types.ts").read_text(encoding="utf-8")
    block = types.split("export const CATEGORIES", 1)[1].split("] as const", 1)[0]
    assert tuple(re.findall(r"['\"]([a-z-]+)['\"]", block)) == CATEGORIES


def test_whole_words_only() -> None:
    # "warm" is not "war", "chain" is not "ai".
    assert categorize_news("Warm weather and supply chain worries", []) == []


@pytest.mark.parametrize(
    ("headline", "code"),
    [
        ("Strong earthquake shakes coastal towns", "EQ"),
        ("Tsunami warning after undersea earthquake", "TS"),
        ("Typhoon brings flooding to northern islands", "TC"),
        ("Volcano erupts, flights cancelled", "VO"),
        ("Wildfires force thousands to flee", "WF"),
        ("Flash floods sweep through valley villages", "FL"),
        ("Landslide buries mountain road", "LS"),
        ("Avalanche kills two skiers", "AV"),
        ("Drought leaves reservoirs at record lows", "DR"),
        ("Heat wave grips the capital", "HW"),
        ("Tornado tears through farmland", "ST"),
        ("Parliament debates the budget", None),
        ("Stormont assembly meets again", None),
    ],
)
def test_hazard_type_from_headline(headline: str, code: str | None) -> None:
    assert hazard_of(headline) == code


def test_every_hazard_code_has_a_label_on_the_site() -> None:
    types = (ROOT / "frontend" / "src" / "types.ts").read_text(encoding="utf-8")
    block = types.split("export const HAZARD_LABELS", 1)[1].split("};", 1)[0]
    labelled = set(re.findall(r"^\s+([A-Z]{2}):", block, re.M))
    gdacs = {"EQ", "TC", "FL", "VO", "DR", "WF"}
    assert {code for code, _ in HAZARD_WORDS} | gdacs == labelled
