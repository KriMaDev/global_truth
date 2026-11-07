# Sources

Every source is checked before it is added: it must be free, and its terms must allow what we show. Each row records when that check was made. The public About / Sources page (milestone 5) is generated from this list, and a test keeps the outlet table below in step with `pipeline/globe_pipeline/outlets.py`.

**Labels shown in the app**
- **Data feed:** structured data from a scientific or official body (USGS, GDACS).
- **News report:** an article by a news outlet. We show its headline as published, the outlet, the time and a link. No snippet, until an outlet's terms or written permission allow one.
- **Machine-coded location:** the place was worked out by GDELT's algorithms from the article text, not given by the outlet.
- **State-affiliated:** see the ownership rule below. Shown on every item from that outlet and on the Sources page.

## Data feeds

| Source | What | Terms (checked) | Credit | Refresh | Status |
|---|---|---|---|---|---|
| [USGS Earthquake Hazards](https://earthquake.usgs.gov/earthquakes/feed/) | Earthquakes M4.5+ and "significant" ones, past week, kept 72 h | USGS-produced data is U.S. public domain; credit is requested ([policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits), 2026-11-07) | "U.S. Geological Survey" | 30 min | Live (M3) |
| [GDACS](https://www.gdacs.org/) | Disaster alerts: Orange and Red of every kind; Green for earthquakes, cyclones, floods and volcanoes (Green wildfires and droughts left out: dozens at any time) | CC BY 4.0 under the European Commission's reuse policy, which GDACS's copyright notice points to ([EC legal notice](https://commission.europa.eu/legal-notice_en), 2026-11-07). Alerts are automated and indicative, not a substitute for official alerts ([terms](https://www.gdacs.org/About/termofuse.aspx)). Changes indicated: our severity is derived from the GDACS alert level | "GDACS (European Commission JRC, UN OCHA)" | 30 min | Live (M3) |
| [NASA EONET v3](https://eonet.gsfc.nasa.gov/) | Natural events (wildfires, storms, volcanoes) | Open API, no key; "for visualization and general information purposes" (2026-11-07) | "NASA EONET" | 60 min | Planned (M7) |

## News

| Source | What | Terms (checked) | Labels | Status |
|---|---|---|---|---|
| [GDELT Project](https://www.gdeltproject.org/) | Global Knowledge Graph, 15-minute files: article headline, link, outlet, places mentioned (with coordinates) and themes. Only the allowlisted outlets below | Unlimited, unrestricted use; must credit and link the GDELT Project ([about](https://www.gdeltproject.org/about.html), 2026-11-07) | News report, machine-coded location | Live (M3), every 30 min |
| [ReliefWeb API v2](https://apidoc.reliefweb.int/) (UN OCHA) | Humanitarian reports | Free; needs a pre-approved `appname` (enforced since 2025-11-01); content stays owned by the original publishers (2026-11-07) | News report | Planned (M7), needs app name |
| Outlet RSS feeds (with snippets) | Headlines and snippets | Most outlets' RSS terms say "personal, non-commercial use" or are unclear (BBC, The Guardian, Al Jazeera, DW checked 2026-11-07), and the EU press publishers' right can cover snippets. Added one outlet at a time once its terms or a written permission allow it | News report | Not used yet |

### Outlet allowlist

Only articles from these outlets appear. GDELT reads far more sites; the allowlist keeps to established newsrooms across regions and viewpoints, including state-affiliated outlets, which are labelled.

**Ownership rule**
- **State-affiliated:** funded and editorially controlled by a government, without legal editorial independence.
- **Public:** publicly funded, with editorial independence guaranteed by law or charter (e.g. BBC, DW, VOA and RFE/RL, whose independence is protected by statute).
- **Private:** privately owned (companies, trusts, non-profits).
- **Intergovernmental:** the news service of an intergovernmental organisation.

**Balance:** at most 30 news events led by any one outlet in the 72-hour window (the most severe, most widely reported and newest are kept). Without it, one prolific outlet can cover a country in lights.

| Outlet | Domain | Country | Ownership |
|---|---|---|---|
| BBC News | bbc.co.uk | United Kingdom | Public |
| The Guardian | theguardian.com | United Kingdom | Private |
| DW | dw.com | Germany | Public |
| France 24 | france24.com | France | Public |
| RFI | rfi.fr | France | Public |
| Euronews | euronews.com | France | Private |
| Kyiv Independent | kyivindependent.com | Ukraine | Private |
| Meduza | meduza.io | Latvia (Russian exile media) | Private |
| TASS | tass.com | Russia | State-affiliated |
| AP News | apnews.com | United States | Private |
| NPR | npr.org | United States | Private |
| VOA | voanews.com | United States | Public |
| RFE/RL | rferl.org | United States (Prague newsroom) | Public |
| CBC News | cbc.ca | Canada | Public |
| MercoPress | mercopress.com | Uruguay | Private |
| Buenos Aires Times | batimes.com.ar | Argentina | Private |
| Al Jazeera | aljazeera.com | Qatar | State-affiliated |
| Anadolu Agency | aa.com.tr | Türkiye | State-affiliated |
| Daily Maverick | dailymaverick.co.za | South Africa | Private |
| Premium Times | premiumtimesng.com | Nigeria | Private |
| Africanews | africanews.com | France (pan-African) | Private |
| The EastAfrican | theeastafrican.co.ke | Kenya | Private |
| NHK World | nhk.or.jp | Japan | Public |
| The Japan Times | japantimes.co.jp | Japan | Private |
| The Hindu | thehindu.com | India | Private |
| Dawn | dawn.com | Pakistan | Private |
| South China Morning Post | scmp.com | Hong Kong | Private |
| Xinhua | xinhuanet.com | China | State-affiliated |
| CGTN | cgtn.com | China | State-affiliated |
| The Straits Times | straitstimes.com | Singapore | Private |
| ABC News (Australia) | abc.net.au | Australia | Public |
| UN News | news.un.org | International | Intergovernmental |

**What is left out:** sport, culture, lifestyle, shopping, opinion, podcasts, video and live pages (by URL path), and articles in none of the five categories. For the English edition only: DW, France 24, RFI, Meduza, Anadolu Agency and NHK World. The Hindu's city pages are left out.

## Reference data

| Source | Used for | Licence |
|---|---|---|
| [GeoNames](https://www.geonames.org/) (`cities15000`, `countryInfo`, `admin1CodesASCII`) | Places, provinces/states, countries | CC BY 4.0, credit "GeoNames" |
| [UN M49](https://unstats.un.org/unsd/methodology/m49/overview/) | Regions (e.g. Western Europe) | UN Statistics Division, free to use with credit; saved in `pipeline/globe_pipeline/data/m49.csv` by `pipeline/tools/fetch_m49.py` |
| [Natural Earth](https://www.naturalearthdata.com/) | Country shapes, seas, mountains (milestone 4) | Public domain |
| [NASA Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) (topography and bathymetry, July 2004) | Earth day texture | Public domain; credit "NASA Earth Observatory" (shown on the page) |
| [NASA Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/) (3 km) | Earth night lights texture | Public domain; credit "NASA Earth Observatory" (shown on the page) |
| [NASA Earth Observatory topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/) (GEBCO_08 land elevation, 5400×2700) | Relief shading on the globe | Imagery by Jesse Allen, NASA Earth Observatory, using data from GEBCO (British Oceanographic Data Centre); credited on the page |
| [Michroma](https://github.com/googlefonts/Michroma-font), [Hanken Grotesk](https://github.com/marcologous/hanken-grotesk), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (via @fontsource) | Fonts, as on krimadev.com | SIL Open Font License 1.1 |

## Not used

| Source | Why |
|---|---|
| ACLED | Needs registration, and its terms limit redistribution and automated/AI use. Only with written permission. |
| Nominatim (OpenStreetMap) | Its usage policy forbids bulk and automated geocoding. Offline GeoNames matching is used instead. |
| GDELT DOC (article search) API | Throttles even single requests ("one every 5 seconds"): too fragile for a schedule. The GKG files carry the same articles. |

## How we fetch
- Every 30 minutes, with a generic User-Agent `WorldNewsGlobe/0.1 (+https://globe.krimadev.com)`, timeouts, and a few retries with backoff.
- GDELT: only the 15-minute files published since the last run (6 hours back on a fresh start, at most 24 files), with a pause between downloads.
- We store only the headline, the outlet or provider, the time, the link, and for data feeds a short factual line built from the feed's own fields (e.g. "Magnitude 5.0, depth 77 km."). Never article text.
