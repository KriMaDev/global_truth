# World News Globe

An interactive 3D globe of current world events, shown as glowing lights coloured by severity. Filter by place (continent → region → country → province → city) and by category (war, politics, natural disasters, economic, technology), and read the news for your selection, always linked to the original source.

**Live:** https://globe.krimadev.com (updated every 30 minutes)

## Honesty principles
- Every item links to and credits its original source. Headlines are never rewritten.
- Duplicate stories are grouped, with all their sources shown.
- Sources span regions and viewpoints. State-affiliated outlets are labelled. The full list is in [docs/sources.md](docs/sources.md).
- Verified data feeds (USGS, GDACS) are labelled apart from news reports, and machine-coded locations are labelled as such.
- For news, only the headline, the outlet, the time and the link are stored and shown. Never article text.
- The data's last update is shown, and each feed's health is published in `/data/feeds.json`.
- Severity follows the published rules in [docs/severity.md](docs/severity.md), and every event says why it has its level.

## How it works
A Python pipeline runs every 30 minutes on GitHub Actions, started on time by a Cloudflare Cron Trigger. It reads USGS earthquakes, GDACS disaster alerts and news from a public allowlist of outlets (via GDELT), places, categorizes, rates and groups them, and writes static JSON. The site is plain files on Cloudflare. There is no server to run or pay for. See [docs/architecture.md](docs/architecture.md).

## Install and run

You need Node.js 24 and Python 3.13.

```bash
# Frontend
npm ci
npm run dev          # http://localhost:5173
npm test             # frontend unit tests (vitest)
npm run build        # type check + build to frontend/dist
npm run preview      # serve the build on http://localhost:4173

# Pipeline
cd pipeline
python -m venv .venv
.venv/Scripts/activate      # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
ruff check . && ruff format --check .
python tools/build_gazetteer.py                          # once: places from GeoNames
python -m globe_pipeline.run --out ../frontend/public/data # fetch the latest events
```

With data in `frontend/public/data/`, `npm run build` and `npm run preview` show the real globe; without it, `npm run dev` uses sample events.

Deploying is described in [docs/deploy.md](docs/deploy.md).

## Project layout

| Part | Path |
|---|---|
| Web app | `frontend/` |
| Data pipeline | `pipeline/` |
| Docs (sources, severity, categories, deploy) | `docs/` |
| CI and scheduled updates | `.github/workflows/` |
| Timer that starts the updates | `worker/` |

## Roadmap
1. ✅ Plan, stack and skeleton, placeholder live (7 Nov 2026)
2. ✅ Globe with sample events and severity lights (on `main`, not deployed: the live site keeps the placeholder until real data)
3. ✅ Live data pipeline: USGS, GDACS, GDELT news from 32 allowlisted outlets; places, categories, severity, grouping (live since 7 Nov 2026)
4. ✅ Filters for type, severity and place (drill-down), a 7-day timeline, grouped pillars, coastlines and borders at night, a Health & outbreaks category with disaster types, a geography view (countries coloured by severity; names of countries, oceans, seas and mountains, each with an "About this place" card from Wikidata and Wikipedia), sharp NASA imagery close up, a footer with version and a Legal & sources page (live since 7 Nov 2026)
5. News panel, source attribution, About / Sources page
6. Polish: animations, performance, mobile, accessibility
7. More sources, monitoring, public API, alerts, languages

## Licence
Code: [MIT](LICENSE), © 2026 KriMa ([krimadev.com](https://krimadev.com)). News content belongs to its publishers. Data is credited to its sources as listed in [docs/sources.md](docs/sources.md).
