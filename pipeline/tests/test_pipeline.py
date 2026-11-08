"""Clustering, the 72-hour window, output files, previous data, failing sources, and the
public outlet list."""

import json
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

import pytest

from globe_pipeline import cluster as cluster_module
from globe_pipeline import run as run_module
from globe_pipeline.cluster import cluster, headline_words, similarity
from globe_pipeline.models import Event, Geo, Source
from globe_pipeline.outlets import OUTLETS
from globe_pipeline.output import load_previous, within_window, write
from globe_pipeline.severity import Severity

REPO = Path(__file__).resolve().parents[2]
YEMEN = Geo("Asia", "Western Asia", "Yemen", "YE", None, None, "country")


def news(
    eid: str, title: str, outlet: str, now, minutes_ago=0, geo=YEMEN, severity=Severity.LOW
) -> Event:
    return Event(
        id=eid,
        title=title,
        place="Yemen",
        lat=15.0,
        lng=48.0,
        severity=severity,
        severity_reason="test",
        categories=["war"],
        kind="news",
        feed="gdelt",
        published=now - timedelta(minutes=minutes_ago),
        first_seen=now,
        sources=[Source(outlet, f"https://{outlet}.example/{eid}")],
        geo=geo,
        location_method="machine-coded",
    )


def test_stemming_matches_word_forms() -> None:
    assert headline_words("Airstrike kills 22") & headline_words("22 killed in airstrike") == {
        "airstrike",
        "kill",
        "22",
    }


def test_differently_worded_reports_of_one_story_merge(now) -> None:
    a = news("a", "Yemen: 22 killed in strike near Sanaa, Houthis say", "dw", now, 30)
    b = news(
        "b",
        "Airstrike kills 22 people near Yemen's capital Sanaa, Houthi official says",
        "hindu",
        now,
    )
    shared, share = similarity(a.title, b.title)
    assert shared >= 3 and share >= 0.6
    merged = cluster([b, a])
    assert len(merged) == 1
    assert merged[0].id == "a"  # the earliest report leads
    assert merged[0].coverage == 2


def test_different_stories_stay_apart(now) -> None:
    a = news("a", "Election results delayed in capital", "dw", now)
    b = news("b", "Floods hit northern provinces", "hindu", now)
    assert len(cluster([a, b])) == 2


def test_same_words_in_another_country_stay_apart(now) -> None:
    other = Geo("Asia", "Western Asia", "Oman", "OM", None, None, "country")
    a = news("a", "Storm floods coastal towns overnight", "dw", now)
    b = news("b", "Storm floods coastal towns overnight", "hindu", now, geo=other)
    assert len(cluster([a, b])) == 2


def test_merge_keeps_highest_severity(now) -> None:
    a = news(
        "a", "Twenty killed in strike on market in Sanaa", "dw", now, 10, severity=Severity.HIGH
    )
    b = news("b", "Strike on Sanaa market kills twenty", "xinhua", now)
    assert cluster([a, b])[0].severity == Severity.HIGH


def test_window_keeps_seven_days(now) -> None:
    fresh = news("f", "Fresh story here today", "dw", now, 60)
    last_week = news("w", "Story from six days ago", "dw", now, 6 * 24 * 60)
    old = news("o", "Story from eight days ago", "dw", now, 8 * 24 * 60)
    assert [e.id for e in within_window([fresh, last_week, old], now)] == ["f", "w"]


def test_outlet_balance_keeps_most_severe(now) -> None:
    events = [news(f"n{i}", f"Story number {i} unique words", "hindu", now, i) for i in range(5)]
    events[3] = replace(events[3], severity=Severity.HIGH)
    kept = run_module.balance_outlets(events, limit=2)
    assert len(kept) == 2
    assert kept[0].id == "n3"


def test_outlet_balance_is_per_day(now) -> None:
    today = [news(f"t{i}", f"Today story {i} words", "hindu", now, i) for i in range(3)]
    yesterday = [
        news(f"y{i}", f"Earlier story {i} words", "hindu", now, 24 * 60 + i) for i in range(3)
    ]
    kept = run_module.balance_outlets(today + yesterday, limit=2)
    assert sorted(e.id[0] for e in kept) == ["t", "t", "y", "y"]


def test_category_basis_survives_json_and_grouping(now) -> None:
    a = replace(news("a", "Sample story one", "dw", now), category_basis={"war": "headline"})
    again = Event.from_json(json.loads(json.dumps(a.to_json())))
    assert again.category_basis == {"war": "headline"}
    b = replace(
        news("b", "Sample story two", "bbc", now),
        categories=["war", "economic"],
        category_basis={"war": "topics", "economic": "section:business"},
    )
    merged = cluster_module.merge(a, b)
    assert merged.category_basis == {"war": "headline", "economic": "section:business"}


def test_sport_has_its_own_allowance(now) -> None:
    stories = [news(f"n{i}", f"News story {i} unique words", "bbc", now, i) for i in range(3)]
    sport = [
        replace(news(f"s{i}", f"Sport story {i} other words", "bbc", now, i), categories=["sport"])
        for i in range(4)
    ]
    kept = run_module.balance_outlets(stories + sport, limit=2, sport_limit=1)
    assert sorted(e.id[0] for e in kept) == ["n", "n", "s"]


def test_day_files_and_index(tmp_path, now) -> None:
    events = [
        news("a", "Story published today", "dw", now, 60),
        news("b", "Story from two days ago", "dw", now, 2 * 24 * 60),
        news("c", "Story from five days ago", "dw", now, 5 * 24 * 60),
    ]
    write(tmp_path, events, [], now, None)
    recent = json.loads((tmp_path / "events.json").read_text(encoding="utf-8"))
    assert sorted(e["id"] for e in recent["events"]) == ["a", "b"]  # last 72 hours only
    index = json.loads((tmp_path / "days" / "index.json").read_text(encoding="utf-8"))
    assert [d["day"] for d in index["days"]] == ["2026-11-07", "2026-11-05", "2026-11-02"]
    day = json.loads((tmp_path / "days" / "2026-11-02.json").read_text(encoding="utf-8"))
    assert [e["id"] for e in day["events"]] == ["c"]
    # A later run drops the day files that fell out of the window.
    write(tmp_path, events[:1], [], now, None)
    assert not (tmp_path / "days" / "2026-11-02.json").exists()


def test_previous_days_are_read_back(tmp_path, now) -> None:
    events = [
        news("a", "Story published today", "dw", now, 60),
        news("c", "Old story", "dw", now, 5 * 24 * 60),
    ]
    write(tmp_path, events, [], now, None)
    assert sorted(e.id for e in load_previous(str(tmp_path)).events) == ["a", "c"]


def test_event_json_round_trip(now) -> None:
    event = news("x", "Round trip story here", "dw", now)
    again = Event.from_json(json.loads(json.dumps(event.to_json())))
    assert again.to_json() == event.to_json()


def test_failing_source_keeps_its_last_events(tmp_path, monkeypatch, gazetteer, now) -> None:
    previous_dir = tmp_path / "previous"
    previous_dir.mkdir()
    kept = news("old1", "Earlier story about the port", "dw", now, 30)
    (previous_dir / "events.json").write_text(
        json.dumps({"events": [kept.to_json()]}), encoding="utf-8"
    )
    (previous_dir / "feeds.json").write_text(
        json.dumps(
            {
                "feeds": [{"id": "gdelt", "last_success": "2026-11-07T11:30:00Z"}],
                "gdelt_cursor": "2026-11-07T11:30:00Z",
            }
        ),
        encoding="utf-8",
    )

    def broken(*_args, **_kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr(run_module.Gazetteer, "load", classmethod(lambda cls, path=None: gazetteer))
    monkeypatch.setattr(run_module.usgs, "fetch", lambda g, n: [])
    monkeypatch.setattr(run_module.gdacs, "fetch", broken)
    monkeypatch.setattr(run_module.gdelt, "fetch", broken)

    out = tmp_path / "out"
    events = run_module.run(out, str(previous_dir), now)
    assert [e.id for e in events] == ["old1"]
    feeds = {
        f["id"]: f for f in json.loads((out / "feeds.json").read_text(encoding="utf-8"))["feeds"]
    }
    assert feeds["usgs"]["status"] == "ok"
    assert feeds["gdacs"]["status"] == "error"
    assert feeds["gdelt"]["status"] == "error"
    assert feeds["gdelt"]["last_success"] == "2026-11-07T11:30:00Z"
    written = json.loads((out / "feeds.json").read_text(encoding="utf-8"))
    assert written["gdelt_cursor"] == "2026-11-07T11:30:00Z"


def test_load_previous_skips_damaged_entries(tmp_path) -> None:
    (tmp_path / "events.json").write_text(
        json.dumps({"events": [{"id": "broken"}]}), encoding="utf-8"
    )
    assert load_previous(str(tmp_path)).events == []
    assert load_previous(str(tmp_path / "missing")).events == []


@pytest.mark.parametrize("outlet", OUTLETS, ids=lambda o: o.name)
def test_every_outlet_is_on_the_legal_page(outlet) -> None:
    page = (REPO / "frontend" / "legal" / "index.html").read_text(encoding="utf-8")
    label = {
        "state": "State-affiliated",
        "public": "Public",
        "private": "Private",
        "intergovernmental": "Intergovernmental",
    }[outlet.ownership]
    row = (
        f"<tr><td>{outlet.name}</td><td>{outlet.domains[0]}</td>"
        f"<td>{outlet.country}</td><td>{label}</td></tr>"
    )
    assert row in page, f"{outlet.name} missing or mislabelled on the legal page"


@pytest.mark.parametrize("outlet", OUTLETS, ids=lambda o: o.name)
def test_every_outlet_is_listed_publicly(outlet) -> None:
    sources = (REPO / "docs" / "sources.md").read_text(encoding="utf-8")
    assert f"| {outlet.name} |" in sources, f"{outlet.name} missing from docs/sources.md"
    if outlet.state_affiliated:
        assert (
            f"| {outlet.name} | {outlet.domains[0]} | {outlet.country} | State-affiliated |"
            in sources
        )
