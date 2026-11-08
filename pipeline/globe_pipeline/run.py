"""Runs the pipeline once: fetch every source, place, categorize, rate, group, write.

Usage:
    python -m globe_pipeline.run --out ../frontend/public/data
    python -m globe_pipeline.run --out OUT --previous https://globe.krimadev.com/data

A failing source never stops the run: its last good events are kept and feeds.json marks it
with status "error" and the time of its last success. A source read only in part (some GDELT
files failed) is marked "partial".
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from .cluster import cluster
from .geocode import Gazetteer
from .models import Event, iso
from .outlets import MAX_EVENTS_PER_OUTLET, MAX_SPORT_EVENTS_PER_OUTLET
from .output import FeedStatus, Previous, day_of, load_previous, within_window, write
from .pages import write_pages
from .sources import gdacs, gdelt, usgs

LOG = logging.getLogger("globe_pipeline")
DEFAULT_PREVIOUS = "https://globe.krimadev.com/data"


def _status(module, kind: str, previous: Previous, now: datetime) -> FeedStatus:
    before = previous.feeds.get(module.ID, {})
    return FeedStatus(
        id=module.ID,
        name=module.NAME,
        kind=kind,
        homepage=module.HOMEPAGE,
        last_attempt=iso(now),
        last_success=before.get("last_success"),
    )


def _run_feed(
    status: FeedStatus, fetch: Callable[[], list[Event]], fallback: list[Event], now: datetime
) -> list[Event]:
    """Runs one source; on failure keeps its previous events and records the error."""
    try:
        events = fetch()
    except Exception as error:
        LOG.warning("%s failed: %s", status.id, error)
        status.status = "error"
        status.note = type(error).__name__
        status.count = len(fallback)
        return fallback
    status.last_success = iso(now)
    status.count = len(events)
    return events


def _mark_partial(status: FeedStatus, last_success: str | None) -> None:
    """Says so when a run that "worked" could not read every file. If it read none at all,
    nothing was updated, so the time of the last success stays as it was."""
    read, missing = status.stats.get("files", 0), status.stats.get("missing_files", 0)
    if status.status != "ok" or not missing:
        return
    status.status = "partial"
    status.note = f"{missing} of {read + missing} files could not be read"
    if not read:
        status.last_success = last_success


def balance_outlets(
    events: list[Event],
    limit: int = MAX_EVENTS_PER_OUTLET,
    sport_limit: int = MAX_SPORT_EVENTS_PER_OUTLET,
) -> list[Event]:
    """Keeps at most `limit` news events led by each outlet per UTC day: the most severe,
    then the most widely reported, then the newest. Sport-only events are counted apart,
    with their own `sport_limit`, so they never push news out. Data-feed events are never
    dropped."""
    kept: list[Event] = [e for e in events if e.kind != "news"]
    by_outlet: dict[tuple[str, str, bool], list[Event]] = {}
    for event in events:
        if event.kind == "news":
            sport_only = event.categories == ["sport"]
            key = (event.sources[0].name, day_of(event), sport_only)
            by_outlet.setdefault(key, []).append(event)
    for (_, _, sport_only), group in by_outlet.items():
        group.sort(key=lambda e: (-int(e.severity), -e.coverage, -e.published.timestamp()))
        kept.extend(group[: sport_limit if sport_only else limit])
    return kept


def run(
    out: Path,
    previous_location: str | None,
    now: datetime | None = None,
    site: Path | None = None,
) -> list[Event]:
    """One full run. Returns the events written."""
    now = now or datetime.now(UTC)
    gazetteer = Gazetteer.load()
    previous = load_previous(previous_location)
    by_feed: dict[str, list[Event]] = {}
    for event in previous.events:
        by_feed.setdefault(event.feed, []).append(event)

    statuses = []
    usgs_status = _status(usgs, "data-feed", previous, now)
    quakes = _run_feed(
        usgs_status, lambda: usgs.fetch(gazetteer, now), by_feed.get("usgs", []), now
    )
    gdacs_status = _status(gdacs, "data-feed", previous, now)
    alerts = _run_feed(
        gdacs_status, lambda: gdacs.fetch(gazetteer, now), by_feed.get("gdacs", []), now
    )
    statuses += [usgs_status, gdacs_status]

    # News accumulates: last run's news plus the articles published since.
    news_status = _status(gdelt, "news", previous, now)
    cursor = previous.gdelt_cursor
    previous_news = by_feed.get("gdelt", [])

    def fetch_news() -> list[Event]:
        nonlocal cursor
        found, cursor, stats = gdelt.fetch(gazetteer, now, previous.gdelt_cursor)
        news_status.stats = stats
        known = {source.url for event in previous_news for source in event.sources}
        return previous_news + [e for e in found if e.sources[0].url not in known]

    last_news_success = news_status.last_success
    news = _run_feed(news_status, fetch_news, previous_news, now)
    _mark_partial(news_status, last_news_success)
    statuses.append(news_status)

    events = balance_outlets(cluster(within_window(quakes + alerts + news, now)))
    news_status.count = sum(1 for e in events if e.kind == "news")
    providers = [
        {"name": m.SOURCE, "credit": m.CREDIT, "homepage": m.HOMEPAGE} for m in (usgs, gdacs)
    ]
    write(out, events, statuses, now, cursor, providers)
    if site is not None:
        write_pages(site, events, statuses, now)
    LOG.info(
        "wrote %d events (%s)",
        len(events),
        ", ".join(f"{s.id} {s.status} {s.count}" for s in statuses),
    )
    return events


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out", type=Path, required=True, help="folder for events.json and feeds.json"
    )
    parser.add_argument(
        "--previous",
        default=DEFAULT_PREVIOUS,
        help="URL prefix or folder of the last published data ('' for a fresh start)",
    )
    parser.add_argument(
        "--site", type=Path, help="folder for news/ and sitemap.xml (default: the parent of --out)"
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    run(args.out, args.previous or None, site=args.site or args.out.parent)
    return 0


if __name__ == "__main__":
    sys.exit(main())
