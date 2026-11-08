"""Polite HTTP: a generic User-Agent, timeouts and a few retries with backoff.

Standard library only, so the pipeline has nothing to install at run time.
"""

from __future__ import annotations

import http.client
import json
import time
import urllib.error
import urllib.request
from typing import Any

#: Names the project and where to read about it; no personal contact details.
USER_AGENT = "WorldNewsGlobe/0.1 (+https://globe.krimadev.com)"


class FetchError(Exception):
    """A source could not be fetched after retries."""


def get(url: str, *, timeout: float = 30, retries: int = 2, backoff: float = 3.0) -> bytes:
    """Downloads `url`, retrying on network errors and 5xx/429 answers.

    Raises:
        FetchError: when every attempt failed, or on a 4xx answer other than 429.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code < 500 and error.code != 429:
                break
        except (
            urllib.error.URLError,
            http.client.HTTPException,
            TimeoutError,
            ConnectionError,
        ) as error:
            last_error = error
        if attempt < retries:
            time.sleep(backoff * (attempt + 1))
    raise FetchError(f"{url}: {last_error}")


def get_json(url: str, **kwargs: Any) -> Any:
    """Downloads and parses JSON."""
    try:
        return json.loads(get(url, **kwargs))
    except json.JSONDecodeError as error:
        raise FetchError(f"{url}: not JSON ({error})") from error
