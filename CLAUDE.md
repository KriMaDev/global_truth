# CLAUDE.md: World News Globe

Project guide for Claude Code. Read this at the start of every session.

## Project summary
An interactive, visually stunning 3D globe that shows current world events as glowing lights, colored by severity. Users can filter by location (All → Continent → Region → Country → Province/State → City) and by category, and read current news for the selection. The goal is an honest, transparent, RSS-style way for anyone to follow global news.

- **Categories:** War, Politics, Natural Disasters, Economic, Technology Advancements, Health & outbreaks (added 8 Nov 2026 for emerging epidemics)
- **Hosting:** **globe.krimadev.com** on Cloudflare Workers static assets (see Decisions)
- **Owner:** KriMaDev (GitHub: github.com/KriMaDev). Python is the owner's strongest language.

## Current status
- [x] Studied star-teller deployment setup (7 Nov 2026)
- [x] Architecture and stack approved by the owner (7 Nov 2026; plan summarised in `docs/architecture.md`)
- [x] Milestone 1: skeleton live at https://globe.krimadev.com (7 Nov 2026), repo https://github.com/KriMaDev/global_truth (public), CI green
- [x] Milestone 2 (7 Nov 2026): globe with sample events, day/night, severity lights, legend, card, keyboard, reduce motion, no-WebGL list. Went public only with milestone 3's real data (owner's rule: no sample/fake news in public; sample events are used only in tests and `npm run dev` without data).
- [x] Milestone 3 built (7 Nov 2026): pipeline (USGS, GDACS, GDELT GKG with a 32-outlet allowlist; GeoNames/M49 places; documented category and severity rules with reasons; grouping; 72 h window), frontend on real data, `update.yml`. **Live since 7 Nov 2026 16:40 UTC** (owner's "go live"): secrets `CLOUDFLARE_API_TOKEN` (owner-made, template "Edit Cloudflare Workers", zone krimadev.com, **no expiration**) and `CLOUDFLARE_ACCOUNT_ID`, variable `LIVE=true`. Updates run at :07 and :37; set `LIVE=false` to pause. First run: 138 events, all feeds ok.
- Decisions for M3 (7 Nov 2026): news via GDELT GKG files (not its throttled search API) from allowlisted outlets only; headline + outlet + time + link, **no snippets** (outlet RSS terms unclear, EU press publishers' right). News is placed only where its headline names a place. Outlet RSS with snippets later, outlet by outlet with permission.
- [x] **Milestone 4 live since 7 Nov 2026 ~22:00 UTC** (owner's "deploy"; PR #1 from branch `milestone-4`, merge commit `78f086e`, deployed by a manual `update.yml` run and checked in a browser). Contents:
  - coastlines/borders (brighter at night); clear close button; footer with version (build date + commit) and a `/legal/` page (publisher: Kristian Manev (KriMa Development), Brussels area, Belgium; contact via krimadev.com/contact, no email printed; privacy, sources, outlets, credits);
  - Health & outbreaks category; natural-disaster type on cards/hover/lists (`hazard`, rules in `docs/categories.md`);
  - grouped pillars with count badges and list cards (Back); filters (type, severity, place drill-down, time) kept in the URL, each chip group with "All off/All on"; 7-day timeline (day files `data/days/`);
  - geography view (`view=geo`): countries coloured by most severe event (rule in `docs/severity.md`), events as dots, decluttered labels for countries, oceans, seas, ranges, deserts, peaks in 5 zoom levels; every label and country opens "About this place" (Wikidata facts + Wikipedia intro, `geo/places.json`, 873 places);
  - Rotate play/pause button (resumes 10 s after touching, not while a card is open; Reduce motion only stops it); zoom limits 0.15–4 (0.5/0.6 until NASA tiles load);
  - close-up NASA GIBS tiles (`globe/detail.ts`, up to 500 m/px) loaded straight from gibs.earthdata.nasa.gov.
- [ ] **Next: milestone 5** (news panel, source attribution, About/Sources page). The legal page already covers sources, outlets and credits, so start in plan mode and agree with the owner what milestone 5 still needs.
- Open follow-ups:
  - GitHub warns that the pinned actions (`actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`, `cache@v4`) target Node 20 (deprecated; forced to Node 24 for now): update to versions at least two weeks old;
  - the `milestone-4` branch can be deleted (ask first);
  - WHO Disease Outbreak News as a health data feed is an idea for milestone 7 (terms check first).
- Commits in this repo use the GitHub noreply address (repo-local git config), never the Gmail address.
- Deploying by hand needs `$env:CLOUDFLARE_ACCOUNT_ID` set to the account ID in krimadev_rebuild's NOTES.md (the OAuth login can't list accounts on its own).

## Decisions (7 Nov 2026)
- **Hosting: everything on Cloudflare, nowhere else** (owner's wish, 7 Nov 2026). krimadev.com, stars.krimadev.com (Star Teller, moved from here.now the same day, Worker `star-teller`) and globe.krimadev.com are each their own Cloudflare Worker. Public contact address: hello@krimadev.com (Email Routing to Gmail). This site runs like krimadev.com: a Cloudflare Worker with static assets only (`wrangler.jsonc`, Worker `world-news-globe`), custom-domain route `globe.krimadev.com`, zone on Cloudflare, `wrangler login` done on this PC. Deploy steps: `docs/deploy.md`.
- **No running server.** The Python pipeline runs on GitHub Actions cron (every 30 min) and writes static JSON, which is deployed with the site. FastAPI is not used.
- **Stack:** Vite + TypeScript (no UI framework) + globe.gl in `frontend/`; Python 3.13 pipeline in `pipeline/` (httpx, feedparser from M3; pytest, ruff). Node 24, npm.
- **Public repo** `KriMaDev/global_truth`, **MIT licence**.
- **State-affiliated outlets are included, with a visible "State-affiliated" label** on items and on the Sources page.
- **Not used:** ACLED (terms), Nominatim (bulk use forbidden). GeoNames + Natural Earth + UN M49 for places.
- **Pins:** only versions at least two weeks old (supply-chain caution).
- **Deploying = merging to `main`** (the scheduled `update.yml` builds and deploys `main`). Work happens on a branch with a pull request (CI runs on it); merge only on the owner's "deploy". Merge **locally** (`git merge --no-ff`, then push) so the merge commit carries the repo's noreply address; then `gh workflow run update.yml --ref main` to publish at once instead of waiting for :07/:37.

## Decisions for milestone 4 (7 Nov 2026, owner)
- **Timeline:** 7 days, as daily files on the same hosting. **Clusters:** clicking a group opens a list. **Refresh:** stays every 30 min (cost: none).
- **Place descriptions:** Wikidata (CC0) facts + the English Wikipedia introduction (CC BY-SA 4.0) shown **word for word** with a link to the exact revision, the licence and the fetch date. Facts filtered to the whole country and current (no "applies to part", no dissolved states). Fetched by hand with `tools/build_places.py` (1 request/s, cached), never by visitors.
- **Close-up imagery:** NASA GIBS tiles loaded by visitors' browsers straight from gibs.earthdata.nasa.gov (not mirrored on Cloudflare). The privacy section on /legal/ says so; CSP `img-src` allows it; GIBS's acknowledgement is on /legal/. Day layer `BlueMarble_ShadedRelief_Bathymetry`, night `VIIRS_Black_Marble` (2016) only at levels 5–6 (PNG tiles up to 450 KB); a close view costs about 1–6 MB.
- **Rotation:** separate Rotate button; Reduce motion is an accessibility setting (turning it on also stops rotation).

## Commands (Windows)
Node needs `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path` in PowerShell.
- Frontend: `npm ci`, `npm run dev`, `npm run build` (type check + build to `frontend/dist`), `npm run deploy` (asks first: it is public).
- Pipeline (in `pipeline/`): `.venv\Scripts\python -m pytest`, `.venv\Scripts\ruff check .`, `.venv\Scripts\ruff format --check .`. Real data: `python tools\build_gazetteer.py` once, then `python -m globe_pipeline.run --out ..\frontend\public\data` (add `--previous ""` for a fresh start; default reads the live site). Never commit `frontend/public/data/` or `.cache/` (git-ignored). Tests use synthetic fixtures only: never commit real headlines.
- Frontend tests: `npm test` (vitest). Preview the build: `npm run preview` (port 4173).
- Textures: `pipeline\.venv\Scripts\python tools\build_textures.py` (NASA sources cached in `.cache/textures/`; output committed).
- Geography data: `pipeline\.venv\Scripts\python tools\build_geo.py` (Natural Earth cached in `.cache/naturalearth/`; writes `frontend/public/geo/`, committed). Run ruff on it from `pipeline/` so the project's line length applies.
- Place descriptions: `pipeline\.venv\Scripts\python tools\build_places.py` (after `build_geo.py`; Wikidata facts CC0 + Wikipedia introductions CC BY-SA 4.0, cached in `.cache/places/`, `--fresh` to refetch; writes `frontend/public/geo/places.json`, committed). Wikipedia text is shown word for word, never shortened, with revision link and licence on each card.
- Browser checks: Playwright from Star Teller's install (`Desktop\Star Teller\apps\web\node_modules\@playwright\test`, `channel: "msedge"`), from a scratchpad script; route the document response to add the CSP from `frontend/public/_headers`, since `vite preview` doesn't apply `_headers`. Headless Edge `--window-size` can't go below about 500 px, so use a 390×844 viewport for phones.
- CSP: `img-src` allows `https://gibs.earthdata.nasa.gov` for the close-up NASA tiles (`src/globe/detail.ts`; owner's decision 7 Nov 2026, stated on /legal/). globe.gl 2.46.2 injects four `<style>` blocks, allowed by hash in `_headers`. After updating globe.gl, run the browser check; it prints any new hash to add. `assetsInlineLimit: 0` in vite.config.ts keeps fonts out of `data:` URLs, which the CSP blocks.
- Browser check scripts used for milestone 4 (desktop 1440×900 and phone 390×844, live CSP): check the footer version and `/legal/`; cluster list + Back; filters and URL; timeline day files; place drill-down; geography labels, hover, place cards; Rotate (after a drag the globe glides about 1.5 s before it stops); zoom limits; NASA tiles (count requests and bytes; also run with gibs blocked: zoom must stop at 0.5); frame rate with ~1,000 synthetic events in **headed** Edge (news ~140 fps, geography ~75–80 far, ~140 close). Scripts live in the session scratchpad, so rewrite them as needed.
- Gotchas:
  - In Git Bash, inline heredoc scripts that contain `\b` or other backslashes can end up as control characters in files (a backspace replaced `\b` twice): write edit scripts with the Write tool and run them, then grep for `\x08`.
  - globe.gl hover box: it needs `.float-tooltip-kap { z-index: 100000 }`, since three's CSS2D renderer numbers labels by depth.
  - Clickable HTML labels/badges must stop `pointerdown`/`pointerup` from bubbling (`shield()` in globe.ts), or globe.gl also "clicks" what lies beneath.
  - `elementFromPoint` ignores `pointer-events: none` elements, so check stacking with screenshots.
- Look and feel: the krimadev.com design language (owner's wish, 7 Nov 2026): `.glass` panels (3px corners, fine line, blur, corner brackets), Michroma title, Hanken Grotesk text, JetBrains Mono uppercase labels, a faint 64px grid behind a transparent globe canvas. **Not** krimadev's teal: the accent is greyish white `#d6dae0`, and turns to the open event's severity colour (`--accent`, set in main.ts). Events are pillars of light (`globe/markers.ts`), taller/wider/faster-pulsing with severity; on phones the event card sits above the legend, never over it. Globe surface: day/night along the real terminator, GEBCO relief lit by the sun, sun-facing atmosphere. No sun glint and no clouds: on a news globe they could be read as real weather.

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
1. ✅ Plan, stack decision and project skeleton, deployed to the subdomain as a placeholder
2. ✅ Globe with static sample events and severity lights
3. ✅ Live data pipeline: 2–3 sources, normalization, geocoding, categories, severity
4. ✅ Location drill-down and category filters (plus timeline, clusters, geography view, place cards, legal page, NASA close-ups)
5. News panel, source attribution, About/Sources page
6. Polish: animations, performance, mobile, accessibility
7. More sources, monitoring, future ideas (language selection, alerts, public RSS/JSON API, saved regions)

## Geography education (owner's goal, 7 Nov 2026)
Done in milestone 4: the geography view, labels and "About this place" cards. Still open: capitals and major cities appearing as you zoom. The original goal follows.

The globe should also teach general geography. Plan it into milestone 4 (location drill-down) and beyond, e.g. country borders and names, capitals and major cities that appear as you zoom, the continent/region/country of the selected place, and a short "about this place" panel with facts from open, credited sources (e.g. Wikidata CC0, GeoNames CC BY). Facts must be sourced like the news: no unsourced text.

**Geography view switch (owner's idea, 7 Nov 2026), milestone 4:** a switch between the news view (pillars) and a geography view: each country coloured by its events' severity (documented rule in `docs/severity.md`, proposal: the highest severity among its current events; none = neutral), events reduced to small dots, and labels for country names, oceans, seas and important mountains (ranges and peaks). Source: Natural Earth (public domain: admin-0 countries, marine polygons, geography regions, elevation points). Needs each event's country from the milestone 3 geocoder.

## Out of scope for now
User accounts, comments, social features, paid data sources, opinion or editorial content.

## Keeping this file useful
When a decision is made (stack, structure, deployment steps, conventions), update this file so future sessions start with the right context. Keep it short and accurate.
