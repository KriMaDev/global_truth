"""Plain pages for search engines, AI assistants and anyone without the 3D globe.

Written at every run, next to the data (git-ignored, like data/):
- news/index.html: the current events by continent and country, with no script. Headlines stay
  word for word, every event names its sources and links to the original;
- sitemap.xml: the site's pages, with the data's time on the ones that change at every run.
"""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime
from html import escape
from pathlib import Path
from urllib.parse import quote

from .models import Event, iso
from .output import RECENT, FeedStatus, order, within_window

SITE = "https://globe.krimadev.com"
#: The site's pages for the sitemap; those marked True change at every run.
PAGES = (
    ("/", True),
    ("/news/", True),
    ("/about/", False),
    ("/sources/", False),
    ("/legal/", False),
)
#: The labels the site shows (frontend/src/types.ts; a test keeps the two in step).
CATEGORY_LABELS = {
    "war": "War",
    "politics": "Politics",
    "natural-disasters": "Natural disasters",
    "economic": "Economic",
    "technology": "Technology advancements",
    "health": "Health & outbreaks",
    "climate": "Climate & environment",
    "crime": "Crime & justice",
    "humanitarian": "Humanitarian & migration",
    "science": "Science & space",
    "sport": "Sport",
}
KIND_LABELS = {"data-feed": "Data feed", "news": "News report"}
DESCRIPTION = (
    "Current world events by continent and country: each headline as its outlet published it, "
    "with its sources, severity and a link to the original."
)
REMOTE_HEADING = "At sea and remote areas"
_NAV = (
    '<nav class="pages"><a href="/">The globe</a> <a href="/about/">About</a> '
    '<a href="/sources/">Sources</a> <a href="/legal/">Legal</a></nav>'
)
_INTRO = (
    "<p>Headlines are shown as their outlets published them, and each links to the original. "
    'Places, categories and severity come from <a href="/about/">published rules</a>; news '
    "locations are worked out by software and can be wrong. This is not official guidance: for "
    "safety decisions, follow your national and local authorities.</p>"
)


def _when(moment: datetime) -> str:
    """ "8 Nov 2026, 10:07 UTC"."""
    return f"{moment.day} {moment:%b %Y, %H:%M} UTC"


def _time(moment: datetime) -> str:
    return f'<time datetime="{iso(moment)}">{_when(moment)}</time>'


def _anchor(name: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")


def _globe_link(path: Iterable[str]) -> str:
    """The globe filtered to a place, e.g. /?place=Asia/Western%20Asia/YE."""
    return f"/?place={quote('/'.join(path), safe='/')}"


def _source(event: Event, index: int) -> str:
    source = event.sources[index]
    label = ' <span class="state">State-affiliated</span>' if source.state_affiliated else ""
    return f'<a href="{escape(source.url, quote=True)}">{escape(source.name)}</a>{label}'


def _event_item(event: Event) -> str:
    level = event.severity.label
    categories = ", ".join(CATEGORY_LABELS.get(c, c) for c in event.categories)
    sources = ", ".join(_source(event, i) for i in range(len(event.sources)))
    url = escape(event.sources[0].url, quote=True)
    reason = f": {escape(event.severity_reason)}" if event.severity_reason else ""
    return (
        f'<li class="event sev-{level}">'
        f'<h4><a href="{url}">{escape(event.title)}</a></h4>'
        f'<p class="meta"><strong>{level.capitalize()} severity</strong>{reason}</p>'
        f'<p class="meta">{escape(KIND_LABELS.get(event.kind, event.kind))} · '
        f"{escape(categories)} · {escape(event.place)} · {_time(event.published)}</p>"
        f'<p class="meta">Source: {sources}</p>'
        "</li>"
    )


def _country_block(name: str, events: list[Event], link: str | None) -> str:
    see = f' <a class="see" href="{escape(link, quote=True)}">See on the globe</a>' if link else ""
    items = "".join(_event_item(event) for event in order(events))
    return f"<h3>{escape(name)} ({len(events)}){see}</h3><ul>{items}</ul>"


def _continent_section(name: str, events: list[Event]) -> str:
    by_country: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        by_country[event.geo.country or "Across the region"].append(event)
    blocks = []
    for country, group in sorted(by_country.items()):
        geo = group[0].geo
        link = (
            _globe_link((geo.continent, geo.region, geo.country_code))
            if geo.continent and geo.region and geo.country_code
            else None
        )
        blocks.append(_country_block(country, group, link))
    return (
        f'<section id="{_anchor(name)}"><h2>{escape(name)} ({len(events)})</h2>'
        f"{''.join(blocks)}</section>"
    )


def _sections(events: list[Event]) -> tuple[str, str]:
    """The table of contents and the sections: continents by name, remote areas last."""
    by_continent: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        by_continent[event.geo.continent or REMOTE_HEADING].append(event)
    names = sorted(name for name in by_continent if name != REMOTE_HEADING)
    if REMOTE_HEADING in by_continent:
        names.append(REMOTE_HEADING)
    contents = " ".join(
        f'<a href="#{_anchor(name)}">{escape(name)} ({len(by_continent[name])})</a>'
        for name in names
    )
    return contents, "".join(_continent_section(name, by_continent[name]) for name in names)


def _feed_warnings(feeds: list[FeedStatus]) -> str:
    return "".join(
        f'<p class="warning">{escape(feed.name)} failed in this update, so its latest good '
        "data is shown.</p>"
        for feed in feeds
        if feed.status != "ok"
    )


def _structured_data(now: datetime, count: int) -> str:
    """JSON-LD for the page. A data block, so the security policy does not apply to it."""
    data = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Current world events by place",
        "description": DESCRIPTION,
        "url": f"{SITE}/news/",
        "dateModified": iso(now),
        "numberOfItems": count,
        "isPartOf": {"@type": "WebSite", "name": "World News Globe", "url": f"{SITE}/"},
    }
    return json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def render_news(events: list[Event], feeds: list[FeedStatus], now: datetime) -> str:
    """The whole /news/ page for the events of the last 72 hours."""
    recent = within_window(events, now, RECENT)
    contents, sections = _sections(recent)
    hours = int(RECENT.total_seconds() // 3600)
    body = sections or "<p>No events in this time window.</p>"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Current world events by place · World News Globe</title>
<meta name="description" content="{escape(DESCRIPTION, quote=True)}">
<link rel="canonical" href="{SITE}/news/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="World News Globe">
<meta property="og:title" content="Current world events by place">
<meta property="og:description" content="{escape(DESCRIPTION, quote=True)}">
<meta property="og:url" content="{SITE}/news/">
<meta property="og:image" content="{SITE}/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#05070a">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/news.css">
<script type="application/ld+json">{_structured_data(now, len(recent))}</script>
</head>
<body>
<main>
{_NAV}
<h1>Current world events by place</h1>
<p class="lead">{len(recent)} events from the last {hours} hours.
Updated {_time(now)}. Refreshed every 30 minutes.</p>
{_INTRO}
{_feed_warnings(feeds)}<nav class="contents">{contents}</nav>
{body}
</main>
</body>
</html>
"""


def render_sitemap(now: datetime) -> str:
    """The sitemap; only pages that change at every run carry a date."""
    entries = []
    for path, changes in PAGES:
        lastmod = f"<lastmod>{iso(now)}</lastmod>" if changes else ""
        entries.append(f"<url><loc>{SITE}{path}</loc>{lastmod}</url>")
    urls = "\n".join(entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'
    )


def write_pages(site: Path, events: list[Event], feeds: list[FeedStatus], now: datetime) -> None:
    """Writes news/index.html and sitemap.xml into the site's folder."""
    (site / "news").mkdir(parents=True, exist_ok=True)
    (site / "news" / "index.html").write_text(render_news(events, feeds, now), encoding="utf-8")
    (site / "sitemap.xml").write_text(render_sitemap(now), encoding="utf-8")
