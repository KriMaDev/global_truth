"""Cleaning text from feeds: entities and tags removed, whitespace collapsed, short snippets.

Headlines are cleaned, never reworded.
"""

from __future__ import annotations

import html
import re

MAX_SNIPPET = 280
_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def clean_text(text: str | None) -> str:
    """Decodes HTML entities, removes tags and collapses whitespace."""
    if not text:
        return ""
    # Twice: some feeds encode entities twice (&amp;amp;).
    decoded = html.unescape(html.unescape(text))
    return _SPACE.sub(" ", _TAG.sub(" ", decoded)).strip()


def snippet(text: str | None, limit: int = MAX_SNIPPET) -> str:
    """A clean snippet of at most `limit` characters, cut at a word, with "…" if cut."""
    clean = clean_text(text)
    if len(clean) <= limit:
        return clean
    cut = clean[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:.-–— ")
    return cut + "…"
