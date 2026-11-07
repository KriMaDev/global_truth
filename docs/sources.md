# Sources

Every source is checked before it is added: it must be free, and its terms must allow showing a headline, a short snippet and a link. Each row records when that check was made. The public About / Sources page (milestone 5) is generated from this list.

**Labels shown in the app**
- **Data feed:** structured data from a scientific or official body.
- **News report:** an article by a news outlet or a humanitarian publisher.
- **Machine-coded:** produced by an algorithm from news text.
- **State-affiliated:** the outlet is funded or controlled by a government. Shown on every item from that outlet and on the Sources page.

## Data feeds

| Source | What | Terms (checked) | Credit | Refresh | Status |
|---|---|---|---|---|---|
| [USGS Earthquake Hazards](https://earthquake.usgs.gov/earthquakes/feed/) | Earthquakes, GeoJSON | USGS-produced data is U.S. public domain; credit is requested ([policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits), 2026-11-07) | "U.S. Geological Survey" | 30 min | Planned (M3) |
| [GDACS](https://www.gdacs.org/) | Disaster alerts (EQ, TC, FL, VO, DR, WF) | Free. Alerts are automated and indicative, not to replace official alerts ([terms](https://www.gdacs.org/About/termofuse.aspx), 2026-11-07). Still to confirm: the EC copyright/reuse notice | "GDACS (European Commission, UN OCHA)" | 30 min | Planned (M3), confirm reuse terms first |
| [NASA EONET v3](https://eonet.gsfc.nasa.gov/) | Natural events (wildfires, storms, volcanoes) | Open API, no key; "for visualization and general information purposes" (2026-11-07) | "NASA EONET" | 60 min | Planned (M7) |

## News and humanitarian

| Source | What | Terms (checked) | Labels | Status |
|---|---|---|---|---|
| [ReliefWeb API v2](https://apidoc.reliefweb.int/) (UN OCHA) | Humanitarian reports | Free; needs a pre-approved `appname` (enforced since 2025-11-01); content stays owned by the original publishers (2026-11-07) | News report | Planned (M7), needs app name |
| [GDELT](https://www.gdeltproject.org/) | Geolocated events from world news | Unlimited, unrestricted use; must credit and link the GDELT Project ([about](https://www.gdeltproject.org/about.html), 2026-11-07) | Machine-coded | Planned (M7) |
| RSS outlets | Headlines by region and section | Checked one by one in M3/M7 | News report, State-affiliated where true | To check |

Candidate outlets, to be checked one by one: BBC, DW, France 24, NHK World, ABC (Australia), CBC, NPR, The Guardian, Al Jazeera, The Hindu, South China Morning Post, Japan Times, Daily Maverick, Premium Times (Nigeria), MercoPress, Kyiv Independent, Meduza, and state-affiliated outlets with their label (e.g. Xinhua, TASS, CGTN, VOA, RFE/RL).

## Reference data

| Source | Used for | Licence |
|---|---|---|
| [GeoNames](https://www.geonames.org/) | Places, provinces/states, countries | CC BY 4.0, credit "GeoNames" |
| [Natural Earth](https://www.naturalearthdata.com/) | Country shapes | Public domain |
| [UN M49](https://unstats.un.org/unsd/methodology/m49/) | Continents and sub-regions | UN Statistics Division, free to use |
| [NASA Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) (topography and bathymetry, July 2004) | Earth day texture | Public domain; credit "NASA Earth Observatory" (shown on the page) |
| [NASA Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/) (3 km) | Earth night lights texture | Public domain; credit "NASA Earth Observatory" (shown on the page) |
| [NASA Earth Observatory topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/) (GEBCO_08 land elevation, 5400×2700) | Relief shading on the globe | Imagery by Jesse Allen, NASA Earth Observatory, using data from GEBCO (British Oceanographic Data Centre); credited on the page |
| [Michroma](https://github.com/googlefonts/Michroma-font), [Hanken Grotesk](https://github.com/marcologous/hanken-grotesk), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (via @fontsource) | Fonts, as on krimadev.com | SIL Open Font License 1.1 |

## Not used

| Source | Why |
|---|---|
| ACLED | Needs registration, and its terms limit redistribution and automated/AI use. Only with written permission. |
| Nominatim (OpenStreetMap) | Its usage policy forbids bulk and automated geocoding. Offline GeoNames matching is used instead. |

## How we fetch
- A conditional GET (ETag / If-Modified-Since) and a minimum interval for each source. Responses are cached, and no feed is fetched more often than its refresh above.
- A generic User-Agent: `WorldNewsGlobe/0.1 (+https://globe.krimadev.com/about)`.
- We store only the headline, a snippet of at most 280 characters, the source, the time and the link. Never the full article text.
