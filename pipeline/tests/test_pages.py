"""The plain pages for search engines and AI assistants (synthetic events only)."""

import re
from datetime import timedelta
from pathlib import Path
from xml.etree import ElementTree

from globe_pipeline.models import Event, Geo, Source
from globe_pipeline.output import FeedStatus
from globe_pipeline.pages import CATEGORY_LABELS, render_news, render_sitemap, write_pages
from globe_pipeline.severity import Severity

REPO = Path(__file__).resolve().parents[2]
BELGIUM = Geo("Europe", "Western Europe", "Belgium", "BE", None, "Sample City", "city")
JAPAN = Geo("Asia", "Eastern Asia", "Japan", "JP", None, None, "country")
AT_SEA = Geo(None, None, None, None, None, None, "remote")


def event(now, eid="a", title="Sample headline", geo=BELGIUM, minutes_ago=5, **changes) -> Event:
    fields = {
        "id": eid,
        "title": title,
        "place": "Sample City, Belgium",
        "lat": 50.0,
        "lng": 4.0,
        "severity": Severity.HIGH,
        "severity_reason": "Headline reports 10 or more deaths",
        "categories": ["war", "politics"],
        "kind": "news",
        "feed": "gdelt",
        "published": now - timedelta(minutes=minutes_ago),
        "first_seen": now,
        "sources": [Source("Example News", "https://example.com/story?a=1&b=2")],
        "geo": geo,
        "location_method": "machine-coded",
    }
    return Event(**(fields | changes))


def test_headline_is_escaped_but_otherwise_unchanged(now) -> None:
    page = render_news([event(now, title='Mayor\'s "plan" <b>& more</b>')], [], now)
    assert "<h4><a" in page
    assert "Mayor&#x27;s &quot;plan&quot; &lt;b&gt;&amp; more&lt;/b&gt;" in page
    assert "<b>&" not in page


def test_links_to_the_original_and_names_the_source(now) -> None:
    page = render_news([event(now)], [], now)
    assert 'href="https://example.com/story?a=1&amp;b=2"' in page
    assert ">Example News</a>" in page


def test_shows_severity_reason_category_kind_and_time(now) -> None:
    page = render_news([event(now)], [], now)
    assert "High severity</strong>: Headline reports 10 or more deaths" in page
    assert "War, Politics" in page
    assert "News report" in page
    assert "<time datetime=" in page


def test_every_source_listed_and_state_affiliation_labelled(now) -> None:
    sources = [
        Source("Example News", "https://example.com/1"),
        Source("State Wire", "https://state.example/2", state_affiliated=True),
    ]
    page = render_news([event(now, sources=sources)], [], now)
    assert '>State Wire</a> <span class="state">State-affiliated</span>' in page
    assert page.count('class="state"') == 1


def test_grouped_by_continent_then_country_with_a_link_to_the_globe(now) -> None:
    page = render_news([event(now, "b", geo=JAPAN), event(now, "a")], [], now)
    assert page.index("<h2>Asia (1)") < page.index("<h2>Europe (1)")
    assert 'href="/?place=Europe/Western%20Europe/BE"' in page
    assert 'href="#europe"' in page


def test_remote_events_come_last_without_a_globe_link(now) -> None:
    page = render_news([event(now, "b", geo=AT_SEA), event(now, "a")], [], now)
    assert page.index("<h2>Europe") < page.index("<h2>At sea and remote areas")
    assert page.count("See on the globe") == 1


def test_only_the_last_72_hours(now) -> None:
    old = event(now, "old", title="Too old", minutes_ago=73 * 60)
    assert "Too old" not in render_news([old, event(now)], [], now)


def test_says_so_when_empty_or_a_feed_failed(now) -> None:
    failed = FeedStatus("gdacs", "GDACS", "data-feed", "https://example.com", status="error")
    page = render_news([], [failed], now)
    assert "No events in this time window." in page
    assert "GDACS failed in this update" in page
    partial = FeedStatus("gdelt", "GDELT", "news", "https://example.com", status="partial")
    assert "GDELT was read only in part" in render_news([], [partial], now)


def test_runs_no_script_and_has_the_tags_crawlers_read(now) -> None:
    page = render_news([event(now)], [], now)
    assert re.findall(r"<script[^>]*>", page) == ['<script type="application/ld+json">']
    for tag in ('rel="canonical"', 'name="description"', 'property="og:title"', '"CollectionPage"'):
        assert tag in page


def test_structured_data_cannot_close_its_own_tag(now) -> None:
    page = render_news([event(now)], [], now)
    block = page.split('application/ld+json">', 1)[1].split("</script>", 1)[0]
    assert "<" not in block


def test_sitemap_lists_the_pages_and_dates_only_those_that_change(now) -> None:
    root = ElementTree.fromstring(render_sitemap(now))
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    dates = {u.find(f"{ns}loc").text: u.find(f"{ns}lastmod") for u in root}
    assert set(dates) == {
        f"https://globe.krimadev.com{p}" for p in ("/", "/news/", "/about/", "/sources/", "/legal/")
    }
    assert dates["https://globe.krimadev.com/news/"] is not None
    assert dates["https://globe.krimadev.com/about/"] is None


def test_write_pages(tmp_path, now) -> None:
    write_pages(tmp_path, [event(now)], [], now)
    assert "Sample headline" in (tmp_path / "news" / "index.html").read_text(encoding="utf-8")
    assert (tmp_path / "sitemap.xml").exists()


def test_category_labels_match_the_site() -> None:
    types = (REPO / "frontend" / "src" / "types.ts").read_text(encoding="utf-8")
    block = types.split("CATEGORY_LABELS", 1)[1].split("};", 1)[0]
    found = dict(re.findall(r'"?([a-z-]+)"?: "([^"]+)"', block))
    assert found == CATEGORY_LABELS


def test_robots_allows_everyone_and_names_the_sitemap() -> None:
    robots = (REPO / "frontend" / "public" / "robots.txt").read_text(encoding="utf-8")
    assert "User-agent: *" in robots
    assert "Allow: /" in robots
    assert "Disallow" not in robots
    assert "Sitemap: https://globe.krimadev.com/sitemap.xml" in robots


def test_llms_txt_points_to_the_pages_and_data() -> None:
    text = (REPO / "frontend" / "public" / "llms.txt").read_text(encoding="utf-8")
    for path in ("/news/", "/about/", "/sources/", "/data/events.json", "/data/feeds.json"):
        assert path in text
