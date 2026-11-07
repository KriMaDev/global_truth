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

## Published data (from milestone 3)

| File | Content |
|---|---|
| `data/events.json` | Stories: headline, snippet, sources, time, place hierarchy, coordinates, categories, severity, coverage |
| `data/feeds.json` | Each feed: last success, last attempt, status, item count |
| `data/places.json` | Continent → region → country → province → city, with counts |
