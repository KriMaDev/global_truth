# Architecture

No server runs all the time. A Python pipeline runs on a schedule and writes static JSON. The site is plain files served by Cloudflare.

```
GitHub Actions (cron, every 30 min)
  └─ Python pipeline: fetch → normalize → group duplicates → geocode → categorize → severity
       └─ writes data/*.json → frontend build + data → wrangler deploy
Cloudflare Workers static assets @ globe.krimadev.com
  └─ browser: Vite + TypeScript + globe.gl (three.js) reads /data/*.json
```

- **Cost and speed.** Static files cost nothing to host and are cached at Cloudflare's edge.
- **Public data.** `/data/*.json` are public URLs, which also serves as the open JSON API.
- **Failures stay contained.** Each source is fetched on its own. If one fails, its last good data is kept and `feeds.json` marks it stale with the time of its last success.
- **State between runs.** Each run reads the previous `events.json` from the live site to keep a rolling 72-hour window and the time each story was first seen.
- **Fallback.** If redeploying every 30 minutes ever causes trouble, `data/` moves to a free R2 bucket.

## Layout

| Part | Path |
|---|---|
| Web app (Vite, TypeScript, globe.gl) | `frontend/` |
| Data pipeline (Python 3.13) | `pipeline/globe_pipeline/`, tests in `pipeline/tests/` |
| Data-building tools (gazetteer) | `pipeline/tools/` |
| Docs | `docs/` |
| CI and scheduled updates | `.github/workflows/` |
| Hosting config | `wrangler.jsonc`, `frontend/public/_headers` |

## Frontend

| Part | Path |
|---|---|
| Page shell: legend, motion switch, card, keyboard list; loads the globe lazily | `frontend/src/main.ts` |
| Globe (globe.gl on three.js): setup, day/night shader, sun position, stars, lights | `frontend/src/globe/` |
| Severity look (colour, size, pulse, rings) | `frontend/src/severity.ts` |
| Event shape and checks (untrusted input is validated, malformed events dropped) | `frontend/src/types.ts`, `frontend/src/events.ts` |
| Earth textures (NASA, public domain), 2K for phones, 4K for wide screens | `frontend/public/textures/`, made by `tools/build_textures.py` |

Everything from a feed is rendered as text (`textContent`), never as HTML.

## Event format

Each event in `events.json` (and in the preview's `frontend/src/data/sample-events.json`):

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id |
| `title` | string ≤ 300 | The original headline, never rewritten |
| `snippet` | string ≤ 280 | Short snippet from the source, never the full text |
| `place` | string | Human-readable place, e.g. "Tokyo, Japan" |
| `lat`, `lng` | number | Position in degrees |
| `severity` | `low` \| `moderate` \| `high` \| `critical` | See docs/severity.md |
| `categories` | list of `war`, `politics`, `natural-disasters`, `economic`, `technology` | Can be empty |
| `kind` | `data-feed` \| `news` \| `sample` | Verified data feed, news report, or preview sample |
| `published` | ISO 8601 string | When the source published it |
| `sources` | list of `{name, url}` | Every outlet covering it (http/https links only) |

## Published data (from milestone 3)

| File | Content |
|---|---|
| `data/events.json` | Stories: headline, snippet, sources, time, place hierarchy, coordinates, categories, severity, coverage |
| `data/feeds.json` | Each feed: last success, last attempt, status, item count |
| `data/places.json` | Continent → region → country → province → city, with counts |
