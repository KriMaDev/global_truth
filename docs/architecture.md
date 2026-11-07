# Architecture

No server runs all the time. A Python pipeline runs on a schedule and writes static JSON. The site is plain files served by Cloudflare.

```
GitHub Actions (.github/workflows/update.yml, every 30 min, once LIVE is on)
  └─ Python pipeline (pipeline/globe_pipeline/run.py, standard library only)
       sources: USGS · GDACS · GDELT GKG (allowlisted outlets)
       → place (GeoNames + UN M49) → categorize → severity → group duplicates
       → merge with the last published data, keep 7 days
       → events.json (last 72 h), days/YYYY-MM-DD.json + days/index.json (7 days), feeds.json
  └─ npm run build (frontend + data) → wrangler deploy
Cloudflare Workers static assets @ globe.krimadev.com
  └─ browser: Vite + TypeScript + globe.gl (three.js) reads /data/events.json,
     and a day file only when the timeline reaches back to that day
```

- **Cost and speed.** Static files cost nothing to host and are cached at Cloudflare's edge.
- **Public data.** `/data/events.json`, `/data/days/` and `/data/feeds.json` are public URLs, which also serve as an open JSON API.
- **Failures stay contained.** Each source is fetched on its own. If one fails, its last good events are kept, and `feeds.json` gives it status `error` with the time of its last success.
- **State between runs.** Each run reads the previous `days/index.json`, the day files it lists, `events.json` and `feeds.json` from the live site. That keeps events for 7 days, keeps the time each story was first seen, and keeps GDELT's cursor (the last 15-minute file read). With nothing published yet, it starts fresh with the last 6 hours.
- **Fallback.** If redeploying every 30 minutes ever causes trouble, `data/` moves to a free R2 bucket.

## Layout

| Part | Path |
|---|---|
| Web app (Vite, TypeScript, globe.gl) | `frontend/` |
| Data pipeline (Python 3.13) | `pipeline/globe_pipeline/`, tests in `pipeline/tests/` |
| Data-building tools (gazetteer, M49 table) | `pipeline/tools/` |
| Asset-building tools (Earth textures; Natural Earth lines, countries and labels) | `tools/build_textures.py`, `tools/build_geo.py` |
| Legal & sources page (second page of the Vite build) | `frontend/legal/index.html`, `frontend/src/legal.ts` |
| Docs | `docs/` |
| CI and scheduled updates | `.github/workflows/ci.yml`, `.github/workflows/update.yml` |
| Hosting config | `wrangler.jsonc`, `frontend/public/_headers` |

## Pipeline

| Step | Module | Rules in |
|---|---|---|
| Fetch (polite, retries, generic User-Agent) | `http.py` | `docs/sources.md` |
| USGS, GDACS, GDELT | `sources/usgs.py`, `sources/gdacs.py`, `sources/gdelt.py` | `docs/sources.md` |
| Outlet allowlist and headline clean-up | `outlets.py` | `docs/sources.md` |
| Places | `geocode.py` | below |
| Categories | `categorize.py` | `docs/categories.md` |
| Severity | `severity.py` | `docs/severity.md` |
| Grouping duplicates | `cluster.py` | below |
| Output, previous data | `output.py`, `run.py` | below |

**Places.**
- **The hierarchy:** continent (GeoNames), region (UN M49, its intermediate region where there is one, e.g. "South America", else its sub-region, e.g. "Western Europe"), country, province/state (GeoNames admin1) and city.
- **Points (USGS, GDACS, and GDELT's coordinates):**
  - The city is the most populous place within 30 km, else the nearest place within 75 km.
  - Within 250 km, the event is at region level ("Valparaiso, Chile").
  - Further away it is "remote" (sea, desert, ice), and the source's own place text is shown.
  - The coordinates decide the country, not a source's country code.
- **News** is placed only where its headline names a place:
  1. A place the headline names itself: the most specific one (city, then region, then country).
  2. Else a country the headline names as part of a place (GDELT records adjectives too: "Russian" names Russia), at country level.
  3. Else the article is not placed on the globe, because guessing from the article's body too often picks the wrong country.

**Grouping duplicates.**
- **News:** two reports are the same story if they are in the same country, within 24 hours, and their headlines share at least 3 meaningful words making up at least 60% of the shorter headline's words. Stop-words and simple endings are ignored, so "killed" and "kills" match.
- **Earthquakes:** a GDACS earthquake within 30 minutes and 150 km of a USGS one is the same earthquake.
- **The merged event** keeps the earliest report's headline (USGS's for earthquakes), lists every source, takes the highest severity and the union of categories.

**Balance.** At most 15 news events per outlet per UTC day (`outlets.MAX_EVENTS_PER_OUTLET`): the most severe, most widely reported and newest are kept.

## Frontend

| Part | Path |
|---|---|
| Page shell: loads the data, legend, motion switch, card, keyboard list; loads the globe lazily | `frontend/src/main.ts` |
| Globe (globe.gl on three.js): setup, day/night and relief shader, sun position, atmosphere, stars | `frontend/src/globe/` |
| Pillars of light, drawn instanced (about 12 draw calls in all), with invisible hit columns; small dots in the geography view | `frontend/src/globe/markers.ts` |
| Groups: pillars closer than 4°, 2° or 1° (by zoom; none when zoomed right in) merge into one, led by the most severe event, with a count badge; clicking opens a list | `frontend/src/clusters.ts` |
| Filters (category, severity, place, time window), kept in the web address (`cat`, `sev`, `place`, `range`, `end`, `view`) | `frontend/src/filters.ts`, `frontend/src/ui/filter-panel.ts` |
| Place drill-down (continent → region → country → province/state → city), built from the events' `geo` | `frontend/src/places.ts`, `frontend/src/ui/place-picker.ts` |
| Timeline: 6 h, 24 h, 3 days, 7 days, and an "ending at" slider; loads day files on demand | `frontend/src/ui/timeline.ts`, `frontend/src/main.ts` |
| Coastlines and borders (Natural Earth 50m), brighter on the night side | `frontend/src/globe/lines.ts`, `frontend/public/geo/lines.bin` |
| Geography view: countries coloured by severity (rule in `docs/severity.md`), labels for countries, oceans, seas, ranges, deserts and peaks by zoom, decluttered on screen | `frontend/src/geography.ts`, `frontend/src/globe/globe.ts`, `frontend/public/geo/countries.json`, `labels.json` |
| "About this place": every country, ocean, sea, range, desert and peak label (and country shape) opens a card with Wikidata facts and the Wikipedia introduction, credited per card; countries add their current events and "Show only these events" | `frontend/src/ui/place-card.ts`, `frontend/src/geography.ts` (`factRows`), `frontend/public/geo/places.json` made by `tools/build_places.py` |
| Rotation: a Rotate play/pause button; touching the globe pauses it, it resumes 10 s later unless a card is open. Zoom limits: altitude 0.5 (0.9 with 2K images) to 4 | `frontend/src/globe/globe.ts` |
| Footer version (build date and commit, set by Vite from git or `GITHUB_SHA`) | `frontend/vite.config.ts` |
| Severity look (colour, size, pulse, rings) | `frontend/src/severity.ts` |
| Event shape and checks (untrusted input is validated, malformed events dropped) | `frontend/src/types.ts`, `frontend/src/events.ts` |
| Earth textures (NASA, public domain), 2K for phones, 4K for wide screens | `frontend/public/textures/`, made by `tools/build_textures.py` |
| Close up: a "detail patch" over the area in view with NASA GIBS tiles (Blue Marble with shaded relief and bathymetry by day, Black Marble 2016 at night; up to 500 m per pixel), drawn with the globe's own day/night shader so it blends in. Shown below altitude 1.0 when the view fits in 6×6 tiles (4×4 on phones); night tiles only at levels 5–6 (they weigh up to 450 KB each); tiles load once the camera pauses and only for the side of the terminator that needs them; after 4 failures in a row it stops for 5 minutes. The zoom may go to altitude 0.15 once a tile has loaded (else 0.5, or 0.6 with 2K images). Tiles load from gibs.earthdata.nasa.gov (allowed by the CSP, stated on the Legal page) | `frontend/src/globe/detail.ts`, `frontend/src/globe/daynight.ts` (DETAIL) |

Everything from a feed is rendered as text (`textContent`), never as HTML. The sample events (`frontend/src/data/sample-events.json`) are used only in unit tests and in `npm run dev` when there is no pipeline data.

## Published data

### `data/events.json`
`{ "generated", "window_hours": 72, "counts": {severity: n}, "events": [...] }`, most severe first, then newest. Each event:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id (`usgs:…`, `gdacs:…`, `gdelt:…`) |
| `title` | string ≤ 300 | The headline as published (outlet name removed from the end), or the data feed's own title |
| `snippet` | string ≤ 280 | Empty for news. For data feeds, a factual line from the feed's fields |
| `place` | string | Readable place, e.g. "Sanaa, Yemen" |
| `lat`, `lng` | number | Position in degrees |
| `severity` | `low` \| `moderate` \| `high` \| `critical` | `docs/severity.md` |
| `severity_reason` | string | Why, in plain words |
| `categories` | list of `war`, `politics`, `natural-disasters`, `economic`, `technology`, `health` | `docs/categories.md` |
| `kind` | `data-feed` \| `news` | Verified data feed or news report (`sample` only in the preview data) |
| `feed` | `usgs` \| `gdacs` \| `gdelt` | Which source led |
| `hazard` | string or null | Type of natural disaster: GDACS/USGS code (EQ, TC, FL, VO, DR, WF) for data feeds; for news, from the headline (also TS, LS, AV, HW, ST); see `docs/categories.md` |
| `published` | ISO 8601 | When the source published it; for news, when GDELT first saw it |
| `first_seen` | ISO 8601 | When our pipeline first saw it |
| `coverage` | integer ≥ 1 | How many different outlets or providers report it |
| `sources` | list of `{name, url, state_affiliated}` | Every report, with a link |
| `geo` | `{continent, region, country, country_code, admin1, city, precision}` | The place hierarchy; `precision` is `city`, `region`, `country` or `remote` |
| `location_method` | `source` \| `machine-coded` | Coordinates from the feed, or worked out by GDELT from the text |

### `data/days/`
- `days/index.json`: `{ "generated", "window_hours": 168, "days": [{day, file, count}] }`, newest day first.
- `days/YYYY-MM-DD.json`: `{ "generated", "day", "events": [...] }`, every event published on that UTC day, in the same shape as above. Only the last 7 days are kept; older files are removed.

### `data/feeds.json`
`{ "generated", "feeds": [{id, name, kind, homepage, status, last_attempt, last_success, count, note?, stats?}], "gdelt_cursor" }`
