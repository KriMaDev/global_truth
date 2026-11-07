# CLAUDE.md: World News Globe

Project guide for Claude Code. Read this at the start of every session.

## Project summary
An interactive, visually stunning 3D globe that shows current world events as glowing lights, colored by severity. Users can filter by location (All → Continent → Region → Country → Province/State → City) and by category, and read current news for the selection. The goal is an honest, transparent, RSS-style way for anyone to follow global news.

- **Categories:** War, Politics, Natural Disasters, Economic, Technology Advancements
- **Hosting:** **globe.krimadev.com** on Cloudflare Workers static assets (see Decisions)
- **Owner:** KriMaDev (GitHub: github.com/KriMaDev). Python is the owner's strongest language.

## Current status
- [x] Studied star-teller deployment setup (7 Nov 2026)
- [x] Architecture and stack approved by the owner (7 Nov 2026; plan summarised in `docs/architecture.md`)
- [ ] Project skeleton deployed as placeholder (skeleton built and checked locally; GitHub repo and first deploy await the owner's go)
- [ ] Update this checklist as milestones are completed

## Decisions (7 Nov 2026)
- **Hosting: Cloudflare, not here.now.** Star Teller is a static site on here.now with `stars → CNAME fallback.here.now`, but the here.now account is on the free plan and its single custom domain is used by stars.krimadev.com. So this site runs like krimadev.com: a Cloudflare Worker with static assets only (`wrangler.jsonc`, Worker `world-news-globe`), custom-domain route `globe.krimadev.com`, zone on Cloudflare, `wrangler login` done on this PC. Deploy steps: `docs/deploy.md`.
- **No running server.** The Python pipeline runs on GitHub Actions cron (every 30 min) and writes static JSON, which is deployed with the site. FastAPI is not used.
- **Stack:** Vite + TypeScript (no UI framework) + globe.gl in `frontend/`; Python 3.13 pipeline in `pipeline/` (httpx, feedparser from M3; pytest, ruff). Node 24, npm.
- **Public repo** `KriMaDev/global_truth`, **MIT licence**.
- **State-affiliated outlets are included, with a visible "State-affiliated" label** on items and on the Sources page.
- **Not used:** ACLED (terms), Nominatim (bulk use forbidden). GeoNames + Natural Earth + UN M49 for places.
- **Pins:** only versions at least two weeks old (supply-chain caution).

## Commands (Windows)
Node needs `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path` in PowerShell.
- Frontend: `npm ci`, `npm run dev`, `npm run build` (type check + build to `frontend/dist`), `npm run deploy` (asks first: it is public).
- Pipeline (in `pipeline/`): `.venv\Scripts\python -m pytest`, `.venv\Scripts\ruff check .`, `.venv\Scripts\ruff format --check .`.
- Phone-size screenshots: headless Edge `--window-size` can't go below about 500 px, so use Playwright with `channel: "msedge"` and a 390×844 viewport.

## How to work
- Start every new feature in plan mode and get approval before large changes.
- Work in small steps and show the result after each milestone.
- Explain trade-offs briefly, in plain language.
- Commit often with clear, descriptive messages.
- Ask before guessing on important decisions (stack, data sources, licensing, hosting).
- Tell the owner clearly about anything that needs manual work (DNS, hosting settings, API keys).
- Do not install heavy dependencies or add paid services without asking first.

## Honesty principles (design requirements, never compromise)
1. Always attribute and link to the original source.
2. Never rewrite, editorialize or sensationalize headlines.
3. Show multiple sources per story where possible and group duplicates.
4. Use a diverse set of reputable sources across regions and viewpoints. List all of them publicly on the About / Sources page.
5. Clearly distinguish verified data feeds (e.g. USGS, GDACS) from news reports.
6. Never reproduce full article text. Store and show only headline, short snippet, source, time and link.
7. Show when each feed was last updated.
8. Severity must come from documented, transparent rules, not arbitrary guesses. Document the rules in `docs/severity.md`.

## Severity scale
Four levels: low, moderate, high, critical. Each has a distinct color, size and pulse speed. The palette must be colorblind-safe and a legend must always be visible. Rules for assigning severity live in `docs/severity.md` and must be kept in sync with the code.

## Data sources
Verify that each source is free and that its terms allow our use before adding it. Record each source, its license/terms and its refresh interval in `docs/sources.md`.

- News: RSS feeds from reputable international and regional outlets, GDELT for geolocated events
- Natural disasters: USGS earthquakes, NASA EONET, GDACS
- Conflict/humanitarian: ReliefWeb, ACLED only if licensing permits
- Economic and tech: RSS from reputable outlets
- Location hierarchy and geocoding: offline GeoNames gazetteer (continent → UN M49 region → country → admin-1 → city), Natural Earth shapes; low-confidence news items stay at country level
- Categorization and severity: rule-based first, optional AI-assisted classifier later

Respect each source's rate limits and terms. Cache aggressively. Never hammer a feed.

## Technical conventions
- **Frontend:** globe.gl (on three.js), Vite + TypeScript
- **Backend:** a scheduled Python pipeline (no server) for fetching, normalizing, geocoding, categorizing and caching feed data
- **Severity palette** is defined in three places that a test keeps in sync: `docs/severity.md`, `pipeline/globe_pipeline/severity.py`, `frontend/src/style.css`.
- **Code style:** clean, modular, documented. Small functions, clear names, type hints in Python, docstrings for public functions.
- **Structure:** keep frontend, backend, data pipeline and docs clearly separated. Follow the final structure in the approved plan.
- **Config and secrets:** use `.env` files, never commit secrets, keep a `.env.example` up to date.
- **Dependencies:** keep them minimal and pinned. Document how to install and run in the README.
- **Tests:** add tests for the pipeline's normalization, geocoding, categorization and severity logic.
- **Git:** small commits, descriptive messages, no generated or secret files in the repo.

## UX and quality requirements
- Premium look and feel: atmosphere glow, night-side city lights, subtle star background, smooth fly-to animations.
- Responsive: side panel on desktop, bottom sheet on mobile.
- Fast loading and good performance on mobile devices.
- Accessible: keyboard navigation, reduced-motion option, colorblind-safe palette, readable contrast.
- Show clear loading, empty and error states. A failing feed must never break the whole app.

## Milestones
1. Plan, stack decision and project skeleton, deployed to the subdomain as a placeholder
2. Globe with static sample events and severity lights
3. Live data pipeline: 2–3 sources, normalization, geocoding, categories, severity
4. Location drill-down and category filters
5. News panel, source attribution, About/Sources page
6. Polish: animations, performance, mobile, accessibility
7. More sources, monitoring, future ideas (language selection, alerts, public RSS/JSON API, saved regions)

## Out of scope for now
User accounts, comments, social features, paid data sources, opinion or editorial content.

## Keeping this file useful
When a decision is made (stack, structure, deployment steps, conventions), update this file so future sessions start with the right context. Keep it short and accurate.
