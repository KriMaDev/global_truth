# World News Globe

An interactive 3D globe of current world events, shown as glowing lights coloured by severity. Filter by place (continent → region → country → province → city) and by category (war, politics, natural disasters, economic, technology), and read the news for your selection, always linked to the original source.

**Live (placeholder):** https://globe.krimadev.com

## Honesty principles
- Every item links to and credits its original source. Headlines are never rewritten.
- Duplicate stories are grouped, with all their sources shown.
- Sources span regions and viewpoints. State-affiliated outlets are labelled. The full list is in [docs/sources.md](docs/sources.md).
- Verified data feeds (USGS, GDACS) are labelled apart from news reports.
- Only the headline, a short snippet, the source, the time and the link are stored. Never the full article text.
- Each feed shows when it was last updated.
- Severity follows the published rules in [docs/severity.md](docs/severity.md).

## How it works
A Python pipeline runs every 30 minutes on GitHub Actions and writes static JSON. The site is plain files on Cloudflare. There is no server to run or pay for. See [docs/architecture.md](docs/architecture.md).

## Install and run

You need Node.js 24 and Python 3.13.

```bash
# Frontend
npm ci
npm run dev          # http://localhost:5173
npm run build        # type check + build to frontend/dist

# Pipeline
cd pipeline
python -m venv .venv
.venv/Scripts/activate      # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
ruff check . && ruff format --check .
```

Deploying is described in [docs/deploy.md](docs/deploy.md).

## Project layout

| Part | Path |
|---|---|
| Web app | `frontend/` |
| Data pipeline | `pipeline/` |
| Docs (sources, severity, categories, deploy) | `docs/` |
| CI and scheduled updates | `.github/workflows/` |

## Roadmap
1. ✅ Plan, stack and skeleton, placeholder live (7 Nov 2026)
2. Globe with sample events and severity lights
3. Live data pipeline (USGS, GDACS, first RSS feeds)
4. Location drill-down and category filters
5. News panel, source attribution, About / Sources page
6. Polish: animations, performance, mobile, accessibility
7. More sources, monitoring, public API, alerts, languages

## Licence
Code: [MIT](LICENSE), © 2026 KriMa ([krimadev.com](https://krimadev.com)). News content belongs to its publishers. Data is credited to its sources as listed in [docs/sources.md](docs/sources.md).
