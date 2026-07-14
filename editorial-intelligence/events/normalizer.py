"""Shared normalization helpers.

Every Provider implements its own `normalize()` (section V) because only
the Provider knows its raw payload's shape — but the small string-hygiene
steps below are identical regardless of source, so they live here once
instead of being copy-pasted into every future Provider subclass.
"""
import re
import unicodedata
from typing import List


def clean_text(value: str) -> str:
    """Collapse whitespace, strip control characters. Does not touch
    diacritics — Vietnamese artist/title text must render as-is."""
    if not value:
        return ""
    value = unicodedata.normalize("NFC", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def dedupe_preserve_order(items: List[str]) -> List[str]:
    seen: List[str] = []
    for item in items:
        cleaned = clean_text(item)
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen
