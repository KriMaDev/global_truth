"""Build the Earth textures for the globe from NASA's public-domain images.

Downloads each source image once into .cache/textures/ (git-ignored), then writes WebP
versions at 2K (phones) and 4K (wide screens) to frontend/public/textures/. Close up, the
site shows NASA GIBS tiles instead (frontend/src/globe/detail.ts). Run it again only
to change sizes or quality; the output files are committed.

Usage (from the repository root, with the pipeline's virtual environment):
    pipeline/.venv/Scripts/python tools/build_textures.py

Sources (public domain, credited in docs/sources.md and on the page):
- Day: NASA Earth Observatory, Blue Marble Next Generation with topography and bathymetry,
  July 2004.
- Night: NASA Earth Observatory, Black Marble 2016 (VIIRS night lights), 3 km.
- Relief: imagery by Jesse Allen, NASA Earth Observatory, using data from the General
  Bathymetric Chart of the Oceans (GEBCO_08), land elevation.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "textures"
OUT = ROOT / "frontend" / "public" / "textures"

NASA = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images"
SOURCES = {
    "day": f"{NASA}/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg",
    "night": f"{NASA}/imagerecords/144000/144898/BlackMarble_2016_3km.jpg",
    # Land elevation in grey (sea is black): relief shading and the land/sea mask.
    "topo": f"{NASA}/bmng/topography/gebco_08_rev_elev_5400x2700.jpg",
}
SIZES = {"2k": (2048, 1024), "4k": (4096, 2048)}
QUALITY = {"day": 82, "night": 80, "topo": 85}
# Stored as grey; the others in colour.
MODES = {"day": "RGB", "night": "RGB", "topo": "L"}
USER_AGENT = "WorldNewsGlobe/0.1 (+https://globe.krimadev.com)"

# The 3 km night image is 13500 x 6750 (91 million pixels), just over Pillow's default
# safety limit for unknown images. These are known NASA files.
Image.MAX_IMAGE_PIXELS = 100_000_000


def download(name: str, url: str) -> Path:
    """Return the cached copy of ``url``, downloading it the first time."""
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / url.rsplit("/", 1)[-1]
    if not target.exists():
        print(f"downloading {name}: {url}")
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            target.write_bytes(response.read())
    return target


def build(name: str, source: Path) -> None:
    """Write every size of one texture as WebP."""
    OUT.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        converted = image.convert(MODES[name])
        for label, size in SIZES.items():
            out = OUT / f"{name}-{label}.webp"
            converted.resize(size, Image.Resampling.LANCZOS).save(
                out, "WEBP", quality=QUALITY[name], method=6
            )
            print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")


def main() -> None:
    for name, url in SOURCES.items():
        build(name, download(name, url))


if __name__ == "__main__":
    main()
