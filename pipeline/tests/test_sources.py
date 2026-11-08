"""The three sources, on synthetic data in each feed's format (no real headlines)."""

import http.client
import io
import zipfile
from datetime import UTC, datetime, timedelta

import pytest

from globe_pipeline import http as pipeline_http
from globe_pipeline.http import FetchError
from globe_pipeline.outlets import OUTLETS, clean_headline, is_sport_page, outlet_for_url
from globe_pipeline.sources import gdacs, gdelt, usgs


def usgs_feature(fid: str, mag: float, lat: float, lng: float, minutes_ago: int, now, alert=None):
    return {
        "id": fid,
        "properties": {
            "mag": mag,
            "place": "10 km N of Somewhere",
            "time": int((now - timedelta(minutes=minutes_ago)).timestamp() * 1000),
            "alert": alert,
            "title": f"M {mag} - 10 km N of Somewhere",
            "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{fid}",
            "tsunami": 0,
            "type": "earthquake",
        },
        "geometry": {"coordinates": [lng, lat, 12.0]},
    }


def test_usgs_parse_window_dedupe_and_fields(gazetteer, now) -> None:
    recent = usgs_feature("a1", 6.2, 42.7, 23.3, 30, now)
    old = usgs_feature("a2", 5.0, 42.7, 23.3, 60 * 24 * 8, now)  # 8 days ago
    events = usgs.parse([{"features": [recent, old]}, {"features": [recent]}], gazetteer, now)
    assert [e.id for e in events] == ["usgs:a1"]
    event = events[0]
    assert event.severity.label == "high"
    assert event.title == "M 6.2 - 10 km N of Somewhere"
    assert event.place == "10 km N of Somewhere"
    assert event.geo.country == "Bulgaria"
    assert event.kind == "data-feed" and event.hazard == "EQ"
    assert event.snippet.startswith("Magnitude 6.2, depth 12 km")


def test_usgs_remote_point(gazetteer, now) -> None:
    event = usgs.parse(
        [{"features": [usgs_feature("r", 4.8, -18.2, -12.9, 5, now)]}], gazetteer, now
    )[0]
    assert event.geo.precision == "remote"
    assert event.geo.country is None


def gdacs_feature(kind: str, level: str, now, lat=15.4, lng=44.2):
    return {
        "geometry": {"coordinates": [lng, lat]},
        "properties": {
            "eventtype": kind,
            "eventid": 99,
            "name": f"Sample {kind} event",
            "alertlevel": level,
            "country": "Yemen",
            "iso3": "YEM",
            "fromdate": (now - timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%S"),
            "todate": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S"),
            "severitydata": {"severitytext": "Magnitude 5.9M, Depth:10km"},
            "source": "NEIC",
            "url": {"report": "https://www.gdacs.org/report.aspx?eventid=99"},
        },
    }


def test_gdacs_keep_rules() -> None:
    assert gdacs.keep({"alertlevel": "Orange", "eventtype": "WF"})
    assert gdacs.keep({"alertlevel": "Green", "eventtype": "EQ"})
    assert not gdacs.keep({"alertlevel": "Green", "eventtype": "WF"})
    assert not gdacs.keep({"alertlevel": "Green", "eventtype": "DR"})


def test_gdacs_parse(gazetteer, now) -> None:
    events = gdacs.parse(
        {"features": [gdacs_feature("FL", "Red", now), gdacs_feature("WF", "Green", now)]},
        gazetteer,
        now,
    )
    assert len(events) == 1
    event = events[0]
    assert event.id == "gdacs:FL99"
    assert event.severity.label == "critical"
    assert "derived" in event.severity_reason
    assert event.geo.city == "Sanaa"
    assert event.sources[0].name == "GDACS"


def gkg_row(
    url: str, title: str, locations: str, themes: str = "", date: str = "20261107113000"
) -> str:
    fields = [""] * 27
    fields[1] = date
    fields[3] = "example"
    fields[4] = url
    fields[7] = themes
    fields[10] = locations
    fields[26] = f"<PAGE_TITLE>{title}</PAGE_TITLE>"
    return "\t".join(fields)


YEMEN = (
    "1#Yemen#YM#YM##15#48#YM#40;4#Sanaa, Amanat Al Asimah, Yemen#YM#YM26##15.3547#44.2067#-1#120"
)


def test_gdelt_row_becomes_a_placed_news_event(gazetteer, now) -> None:
    # No listed war word in the headline ("strike" is ambiguous), so GDELT's themes decide.
    row = gkg_row(
        "https://www.dw.com/en/sample/a-1",
        "Sample: 22 killed in strike near Sanaa – DW",
        YEMEN,
        "ARMEDCONFLICT;MILITARY;KILL",
    )
    events, unplaced = gdelt.parse_rows(row, gazetteer, now)
    assert unplaced == 0
    event = events[0]
    assert event.title == "Sample: 22 killed in strike near Sanaa"
    assert event.place == "Sanaa, Yemen"
    assert event.geo.precision == "city"
    assert event.severity.label == "high"
    assert event.categories == ["war"]
    assert event.location_method == "machine-coded"
    assert event.sources[0].name == "DW"
    assert event.snippet == ""


def test_gdelt_ignores_outlets_not_on_the_allowlist(gazetteer, now) -> None:
    row = gkg_row("https://example.com/news/1", "Sample: 22 killed in strike near Sanaa", YEMEN)
    assert gdelt.parse_rows(row, gazetteer, now) == ([], 0)


def test_gdelt_country_named_by_adjective_is_country_level(gazetteer, now) -> None:
    locations = "1#Russian#RS#RS##60#100#RS#10;4#Gay, Orenburg, Russia#RS#RS55##51.47#58.45#-1#300"
    row = gkg_row(
        "https://www.aljazeera.com/news/1",
        "Sample: traders avoid Russian diesel exports",
        locations,
        "ECON_TRADE",
    )
    event = gdelt.parse_rows(row, gazetteer, now)[0][0]
    assert event.geo.precision == "country"
    assert event.geo.country == "Russia"


def test_gdelt_unnamed_place_is_not_placed(gazetteer, now) -> None:
    row = gkg_row(
        "https://www.aljazeera.com/news/2", "Sample: who will lead the troops next year?", YEMEN
    )
    events, unplaced = gdelt.parse_rows(row, gazetteer, now)
    assert events == [] and unplaced == 1


def test_gdelt_coordinates_decide_the_country(gazetteer, now) -> None:
    # GDELT tags Gaza with Israel's FIPS code; the coordinates say Palestinian Territory.
    locations = "4#Gaza, Gaza Strip, Israel#IS#IS00##31.5#34.47#-1#50"
    row = gkg_row(
        "https://www.aljazeera.com/news/3", "Sample: storm floods tents in Gaza", locations
    )
    event = gdelt.parse_rows(row, gazetteer, now)[0][0]
    assert event.geo.country == "Palestinian Territory"


def test_gdelt_sport_page_is_sport_only(gazetteer, now) -> None:
    row = gkg_row(
        "https://www.bbc.co.uk/sport/football/2",
        "Sample: Sanaa side's offensive line storms to victory",
        YEMEN,
        "MILITARY;ARMEDCONFLICT",
    )
    event = gdelt.parse_rows(row, gazetteer, now)[0][0]
    assert event.categories == ["sport"]


def test_gdelt_whole_country_takes_gdelts_country_code(gazetteer, now) -> None:
    # Israel's country point lies next to Gaza; a whole-country mention stays Israel.
    locations = "1#Israel#IS#IS##31.5#34.75#IS#20"
    row = gkg_row(
        "https://www.aljazeera.com/news/4",
        "Sample: Israeli president names a new prime minister",
        locations,
    )
    event = gdelt.parse_rows(row, gazetteer, now)[0][0]
    assert event.geo.country == "Israel"
    assert event.geo.precision == "country"


def test_gdelt_stamps_to_fetch(now) -> None:
    latest = gdelt.parse_stamp("20261107120000")
    stamps = gdelt.stamps_to_fetch(gdelt.parse_stamp("20261107113000"), latest)
    assert [gdelt.stamp(s) for s in stamps] == ["20261107114500", "20261107120000"]
    assert len(gdelt.stamps_to_fetch(None, latest)) == gdelt.MAX_FILES


def _gdelt_run(monkeypatch, gazetteer, now, cursor, latest, failing):
    """One gdelt.fetch where the files stamped in `failing` can't be downloaded."""

    def read_file(moment):
        if gdelt.stamp(moment) in failing:
            raise FetchError("not there")
        return ""

    monkeypatch.setattr(gdelt, "PAUSE_SECONDS", 0)
    monkeypatch.setattr(gdelt, "latest_stamp", lambda: gdelt.parse_stamp(latest))
    monkeypatch.setattr(gdelt, "read_file", read_file)
    return gdelt.fetch(gazetteer, now, gdelt.parse_stamp(cursor))


def test_gdelt_comes_back_for_a_file_it_could_not_read(monkeypatch, gazetteer) -> None:
    now = gdelt.parse_stamp("20261107121000")
    _, cursor, stats = _gdelt_run(
        monkeypatch, gazetteer, now, "20261107113000", "20261107120000", {"20261107114500"}
    )
    assert gdelt.stamp(cursor) == "20261107113000"
    assert stats["files"] == 1
    assert stats["missing_files"] == 1
    # The next run starts with the file that failed.
    assert gdelt.stamp(gdelt.stamps_to_fetch(cursor, now)[0]) == "20261107114500"


def test_gdelt_moves_on_when_every_file_was_read(monkeypatch, gazetteer) -> None:
    now = gdelt.parse_stamp("20261107121000")
    _, cursor, _ = _gdelt_run(
        monkeypatch, gazetteer, now, "20261107113000", "20261107120000", set()
    )
    assert gdelt.stamp(cursor) == "20261107120000"


def test_gdelt_gives_up_on_a_file_after_two_hours(monkeypatch, gazetteer) -> None:
    now = gdelt.parse_stamp("20261107121000")
    _, cursor, stats = _gdelt_run(
        monkeypatch, gazetteer, now, "20261107093000", "20261107103000", {"20261107094500"}
    )
    assert gdelt.stamp(cursor) == "20261107103000"
    assert stats["missing_files"] == 1


def test_outlet_matching_and_paths() -> None:
    assert outlet_for_url("https://www.bbc.co.uk/news/world-1").name == "BBC News"
    # Sport sections are kept, as Sport; culture and the like stay out.
    assert outlet_for_url("https://www.bbc.co.uk/sport/football/1").name == "BBC News"
    assert is_sport_page("https://www.bbc.co.uk/sport/football/1")
    assert is_sport_page("https://www.theguardian.com/football/2026/nov/08/x")
    assert not is_sport_page("https://www.bbc.co.uk/news/world-1")
    assert outlet_for_url("https://www.bbc.co.uk/culture/article/1") is None
    assert outlet_for_url("https://www.dw.com/de/thema/a-1") is None  # German edition
    assert outlet_for_url("https://www.thehindu.com/news/cities/x/1.ece") is None
    assert outlet_for_url("https://notbbc.co.uk.example.com/news") is None


def test_headline_cleaning_removes_only_the_outlet_name() -> None:
    guardian = next(o for o in OUTLETS if o.name == "The Guardian")
    xinhua = next(o for o in OUTLETS if o.name == "Xinhua")
    jazeera = next(o for o in OUTLETS if o.name == "Al Jazeera")
    assert (
        clean_headline("Floods hit city | World news | The Guardian", guardian) == "Floods hit city"
    )
    assert clean_headline("Talks resume: officials-Xinhua", xinhua) == "Talks resume: officials"
    assert clean_headline("Ship hit | Iran War News | Al Jazeera", jazeera) == "Ship hit"
    assert clean_headline("Guardian angels honoured", guardian) == "Guardian angels honoured"


FILE_MOMENT = datetime(2026, 11, 7, 12, 0, tzinfo=UTC)


def test_gdelt_treats_a_damaged_zip_as_a_failed_file(monkeypatch) -> None:
    monkeypatch.setattr(gdelt, "get", lambda *a, **k: b"this is not a zip file")
    with pytest.raises(FetchError):
        gdelt.read_file(FILE_MOMENT)


def test_gdelt_treats_an_empty_zip_as_a_failed_file(monkeypatch) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w"):
        pass
    monkeypatch.setattr(gdelt, "get", lambda *a, **k: buffer.getvalue())
    with pytest.raises(FetchError):
        gdelt.read_file(FILE_MOMENT)


def test_gdelt_refuses_a_file_that_unzips_too_big(monkeypatch) -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("a.csv", b"0" * 2048)
    monkeypatch.setattr(gdelt, "get", lambda *a, **k: buffer.getvalue())
    monkeypatch.setattr(gdelt, "MAX_UNZIPPED_BYTES", 1024)
    with pytest.raises(FetchError):
        gdelt.read_file(FILE_MOMENT)


def test_a_download_cut_off_half_way_is_a_failed_fetch(monkeypatch) -> None:
    def cut_off(*_args, **_kwargs):
        raise http.client.IncompleteRead(b"partial")

    monkeypatch.setattr(pipeline_http.urllib.request, "urlopen", cut_off)
    with pytest.raises(FetchError):
        pipeline_http.get("https://example.org/file", retries=0)


def test_only_web_addresses_count_as_an_outlets_article() -> None:
    domain = OUTLETS[0].domains[0]
    assert outlet_for_url(f"javascript://{domain}/%0aalert(1)") is None
