"""The allowlist of news outlets whose articles GDELT reports to us.

Only these outlets appear on the globe. Every outlet is listed publicly in docs/sources.md
(a test keeps the two in step), with its ownership:

- "state": funded and editorially controlled by a government, without legal editorial
  independence. Shown as "State-affiliated" on every item and on the Sources page.
- "public": publicly funded with editorial independence guaranteed by law or charter.
- "private": privately owned (companies, trusts and non-profits).
- "intergovernmental": the news service of an intergovernmental organisation (the UN).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

#: At most this many news events per outlet per UTC day (the most severe, most
#: widely reported and newest are kept), so no single outlet dominates the globe.
MAX_EVENTS_PER_OUTLET = 15
#: Sport-only events have their own, smaller allowance per outlet per UTC day, counted
#: apart from the news, so sport never pushes news off the globe.
MAX_SPORT_EVENTS_PER_OUTLET = 5

#: URL paths of outlets' sport sections: kept, and categorized as Sport only.
SPORT_PATHS = ("/sport", "/football")

#: URL paths that are not news reports (audio, video, culture, live pages).
COMMON_EXCLUDED_PATHS = (
    "/sounds/",
    "/podcast",
    "/video",
    "/videos/",
    "/av/",
    "/live/",
    "/liveblog",
    "/live-",
    "/programmes/",
    "/culture",
    "/entertainment",
    "/lifestyle",
    "/travel",
    "/food",
    "/opinion",
    "/commentisfree",
    "/lifeandstyle",
    "/thefilter",
    "/fashion",
    "/books",
    "/music",
    "/film",
    "/tv-and-radio",
    "/games",
    "/crosswords",
    "/shopping",
    "/recipes",
    "/horoscope",
    "/puzzles",
)


@dataclass(frozen=True)
class Outlet:
    """A news outlet on the allowlist."""

    name: str
    domains: tuple[str, ...]
    country: str
    region: str
    ownership: str
    #: Names the outlet adds to the end of its page titles (e.g. "BBC News"), removed from
    #: headlines together with any section tag before them (" | World news | The Guardian").
    title_names: tuple[str, ...] = ()
    #: If set, only URLs whose path starts with one of these (e.g. the English edition).
    include_paths: tuple[str, ...] = ()
    #: Extra URL paths left out for this outlet (e.g. city pages of a national paper).
    exclude_paths: tuple[str, ...] = ()

    @property
    def state_affiliated(self) -> bool:
        return self.ownership == "state"


OUTLETS: tuple[Outlet, ...] = (
    # Europe
    Outlet(
        "BBC News",
        ("bbc.co.uk", "bbc.com"),
        "United Kingdom",
        "Europe",
        "public",
        ("BBC News", "BBC"),
    ),
    Outlet(
        "The Guardian",
        ("theguardian.com",),
        "United Kingdom",
        "Europe",
        "private",
        ("The Guardian",),
    ),
    Outlet("DW", ("dw.com",), "Germany", "Europe", "public", ("DW",), ("/en/",)),
    Outlet("France 24", ("france24.com",), "France", "Europe", "public", ("France 24",), ("/en/",)),
    Outlet("RFI", ("rfi.fr",), "France", "Europe", "public", ("RFI",), ("/en/",)),
    Outlet("Euronews", ("euronews.com",), "France", "Europe", "private", ("Euronews",)),
    Outlet(
        "Kyiv Independent",
        ("kyivindependent.com",),
        "Ukraine",
        "Europe",
        "private",
        ("The Kyiv Independent", "Kyiv Independent"),
    ),
    Outlet(
        "Meduza",
        ("meduza.io",),
        "Latvia (Russian exile media)",
        "Europe",
        "private",
        ("Meduza",),
        ("/en/",),
    ),
    Outlet("TASS", ("tass.com",), "Russia", "Europe", "state", ("TASS",)),
    # Americas
    Outlet("AP News", ("apnews.com",), "United States", "Americas", "private", ("AP News",)),
    Outlet("NPR", ("npr.org",), "United States", "Americas", "private", ("NPR",)),
    Outlet("VOA", ("voanews.com",), "United States", "Americas", "public", ("VOA",)),
    Outlet(
        "RFE/RL", ("rferl.org",), "United States (Prague newsroom)", "Europe", "public", ("RFE/RL",)
    ),
    Outlet("CBC News", ("cbc.ca",), "Canada", "Americas", "public", ("CBC News", "CBC")),
    Outlet("MercoPress", ("mercopress.com",), "Uruguay", "Americas", "private", ("MercoPress",)),
    Outlet(
        "Buenos Aires Times",
        ("batimes.com.ar",),
        "Argentina",
        "Americas",
        "private",
        ("Buenos Aires Times",),
    ),
    # Middle East and Africa
    Outlet("Al Jazeera", ("aljazeera.com",), "Qatar", "Middle East", "state", ("Al Jazeera",)),
    Outlet(
        "Anadolu Agency",
        ("aa.com.tr",),
        "Türkiye",
        "Middle East",
        "state",
        ("Anadolu Ajansı", "Anadolu Agency"),
        ("/en/",),
    ),
    Outlet(
        "Daily Maverick",
        ("dailymaverick.co.za",),
        "South Africa",
        "Africa",
        "private",
        ("Daily Maverick",),
    ),
    Outlet(
        "Premium Times",
        ("premiumtimesng.com",),
        "Nigeria",
        "Africa",
        "private",
        ("Premium Times Nigeria", "Premium Times"),
    ),
    Outlet(
        "Africanews",
        ("africanews.com",),
        "France (pan-African)",
        "Africa",
        "private",
        ("Africanews",),
    ),
    Outlet(
        "The EastAfrican",
        ("theeastafrican.co.ke",),
        "Kenya",
        "Africa",
        "private",
        ("The EastAfrican",),
    ),
    # Asia and Oceania
    Outlet(
        "NHK World",
        ("nhk.or.jp",),
        "Japan",
        "Asia",
        "public",
        ("NHK WORLD-JAPAN News",),
        ("/nhkworld/en/",),
    ),
    Outlet(
        "The Japan Times", ("japantimes.co.jp",), "Japan", "Asia", "private", ("The Japan Times",)
    ),
    Outlet(
        "The Hindu",
        ("thehindu.com",),
        "India",
        "Asia",
        "private",
        ("The Hindu",),
        (),
        ("/news/cities/",),
    ),
    Outlet("Dawn", ("dawn.com",), "Pakistan", "Asia", "private", ("DAWN.COM", "Dawn")),
    Outlet(
        "South China Morning Post",
        ("scmp.com",),
        "Hong Kong",
        "Asia",
        "private",
        ("South China Morning Post", "SCMP"),
    ),
    Outlet("Xinhua", ("xinhuanet.com", "news.cn"), "China", "Asia", "state", ("Xinhua",)),
    Outlet("CGTN", ("cgtn.com",), "China", "Asia", "state", ("CGTN",)),
    Outlet(
        "The Straits Times",
        ("straitstimes.com",),
        "Singapore",
        "Asia",
        "private",
        ("The Straits Times",),
    ),
    Outlet(
        "ABC News (Australia)", ("abc.net.au",), "Australia", "Oceania", "public", ("ABC News",)
    ),
    # International organisations
    Outlet(
        "UN News",
        ("news.un.org",),
        "International",
        "International",
        "intergovernmental",
        ("UN News",),
    ),
)


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def outlet_for_url(url: str) -> Outlet | None:
    """The allowlisted outlet that published `url`, or None (also for non-news pages)."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    path = parts.path.lower()
    for outlet in OUTLETS:
        if not any(_host_matches(host, domain) for domain in outlet.domains):
            continue
        if outlet.include_paths and not any(path.startswith(p) for p in outlet.include_paths):
            return None
        if any(excluded in path for excluded in COMMON_EXCLUDED_PATHS + outlet.exclude_paths):
            return None
        return outlet
    return None


def is_sport_page(url: str) -> bool:
    """Whether `url` is in an outlet's sport section (see SPORT_PATHS)."""
    path = urlsplit(url).path.lower()
    return any(sport in path for sport in SPORT_PATHS)


# " | Name", " - Name", " : Name", or a dash with no space before it ("...says-Xinhua").
_SEPARATOR = r"(?:\s+[|\-–—:]|\s*[|\-–—])\s*"
#: A section tag some outlets add before their name or at the end (" | World news", " | News").
_SECTION_TAG = re.compile(r"\s+\|\s+[^|]{1,40}?\bnews\s*$", re.I)


def clean_headline(title: str, outlet: Outlet) -> str:
    """Removes the outlet's own name (and a section tag before it) from the end of a page
    title, e.g. "Floods hit city | World news | The Guardian" -> "Floods hit city". The
    headline itself is never changed."""
    cleaned = title.strip()
    for name in outlet.title_names:
        pattern = re.compile(
            _SEPARATOR + r"(?:[^|]{1,40}?\s+\|\s+)?" + re.escape(name) + r"\s*$", re.I
        )
        stripped = pattern.sub("", cleaned)
        if stripped != cleaned:
            cleaned = stripped
            break
    return _SECTION_TAG.sub("", cleaned).strip()
