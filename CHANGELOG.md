# Changelog

Every release of World News Globe, newest first. The footer shows the version and the build date, such as "Version 1.9.0 · 2026-11-14", and links here. Each version has a git tag (`v1.9.0`) on the commit that went live.

Numbers are MAJOR.MINOR.PATCH: a new feature or a visible change raises the middle number, fixes, texts and maintenance the last. 1.0.0 is the first version with real events (milestone 3); 0.1.0 and 0.2.0 are milestones 1 and 2. Changes to tests, CI and notes alone are listed with the release they shipped in.

## 1.9.0 · 2026-11-14

- The footer shows a version number and the build date, and links to this changelog, instead of the commit.
- Development tools: wrangler 4.156.1.

## 1.8.2 · 2026-11-14

- The legal page after a GDPR review: every right is listed, people named in a headline can ask for its removal, messages are handled under krimadev.com's privacy policy, and Cloudflare's request logs and the EU-US Data Privacy Framework are named.
- Development tools: wrangler 4.155.0, typescript-eslint 8.72.1, @types/node 26.6.6.

## 1.8.1 · 2026-11-10

- GDELT is reported as partly read only when a file is an hour overdue.
- Security fix in the development tools (minimatch 11.0.1).

## 1.8.0 · 2026-11-10

- Atlas: big cities, islands and every other feature, with matched descriptions; better river matching. Milestone 6 finished.

## 1.7.0 · 2026-11-10

- Three maps: News, Geography with capitals, and a news-free Atlas; stacked news fans out when zoomed in; US states and their capitals; more room on the top row.

## 1.6.0 · 2026-11-09

- Accessibility: automatic checks and fixes, Escape returns from Info, filter changes are announced; no text under 11 px, with an A / A+ size switch; plainer words; Geography labels; an event opened close up stays in view.

## 1.5.0 · 2026-11-08

- Faster: Geography drawn as one object, a smaller download, an earlier start; the globe button also returns to the starting view.

## 1.4.0 · 2026-11-08

- Every touch screen gets the touch layout, and panels fit any screen. Browser tests for filters, cards, Headlines, pages and Geography.

## 1.3.0 · 2026-11-08

- Phones: one row of controls, a compact footer, safe zoom; touch drags start anywhere on the globe; a failsafe for GDELT.

## 1.2.2 · 2026-11-08

- The standards shared with krimadev.com and Star Teller: security headers, a script policy and a locked-down deploy.

## 1.2.1 · 2026-11-08

- GDELT files that fail, or arrive damaged, are tried again, and the status says so.

## 1.2.0 · 2026-11-08

- Milestone 5: the Headlines panel, source attribution, About and Sources pages, more categories, and plain pages for search engines and AI assistants.

## 1.1.1 · 2026-11-08

- Updates on time: a Cloudflare Cron Trigger in its own Worker starts the data update every 30 minutes.

## 1.1.0 · 2026-11-07

- Milestone 4: filters, timeline, groups, the geography view, place cards, sharp NASA close-ups and the legal page.

## 1.0.0 · 2026-11-07

- Milestone 3: real events every 30 minutes from USGS, GDACS and GDELT news from allowlisted outlets, with an attribution card and the data time.

## 0.2.0 · 2026-11-07

- Milestone 2: the globe with sample events and severity lights, pillars of light and the krimadev.com look.

## 0.1.0 · 2026-11-07

- Milestone 1: a placeholder page at globe.krimadev.com, the project skeleton and CI.
