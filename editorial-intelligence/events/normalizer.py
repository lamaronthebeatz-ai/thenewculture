"""Shared normalization helpers.

Every Provider implements its own `normalize()` (section V) because only
the Provider knows its raw payload's shape — but the small string-hygiene
steps below are identical regardless of source, so they live here once
instead of being copy-pasted into every future Provider subclass.

Phase 2 (section III) adds `EventNormalizer`, rule-based normalization
for the six fields the spec names (artist, title, date, url, platform,
event_type). Everything above this docstring's original functions
(`clean_text`, `dedupe_preserve_order`) is untouched from Phase 1.
"""
import datetime
import re
import unicodedata
from typing import List, Optional

from ..models.enums import EventType, SourceTier


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


# --- Phase 2 additions (section III) -------------------------------------

_EVENT_TYPE_ALIASES = {
    "album": EventType.ALBUM_RELEASE,
    "album_release": EventType.ALBUM_RELEASE,
    "single": EventType.SINGLE_RELEASE,
    "single_release": EventType.SINGLE_RELEASE,
    "mv": EventType.MV_RELEASE,
    "music_video": EventType.MV_RELEASE,
    "mv_release": EventType.MV_RELEASE,
    "artist_announcement": EventType.ARTIST_ANNOUNCEMENT,
    "announcement": EventType.ARTIST_ANNOUNCEMENT,
    "festival": EventType.FESTIVAL,
    "concert": EventType.CONCERT,
    "show": EventType.CONCERT,
    "live": EventType.CONCERT,
    "interview": EventType.INTERVIEW,
    "award": EventType.AWARD,
    "awards": EventType.AWARD,
    "community": EventType.COMMUNITY_EVENT,
    "community_event": EventType.COMMUNITY_EVENT,
}

_SOURCE_TIER_ALIASES = {
    "official": SourceTier.TIER_1,
    "tier_1": SourceTier.TIER_1,
    "tier1": SourceTier.TIER_1,
    "editorial": SourceTier.TIER_2,
    "tier_2": SourceTier.TIER_2,
    "tier2": SourceTier.TIER_2,
    "community": SourceTier.TIER_3,
    "tier_3": SourceTier.TIER_3,
    "tier3": SourceTier.TIER_3,
    "unknown": SourceTier.UNKNOWN,
}

_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y")


def normalize_artist(raw: str) -> str:
    return clean_text(raw)


def normalize_title(raw: str) -> str:
    return clean_text(raw)


def normalize_platform(raw: Optional[str]) -> Optional[str]:
    cleaned = clean_text(raw or "")
    return cleaned.lower() or None


def normalize_url(raw: Optional[str]) -> Optional[str]:
    cleaned = clean_text(raw or "")
    return cleaned or None


def normalize_date(raw: Optional[str]) -> Optional[str]:
    """Rule-based only (section III: "Không dùng AI. Chỉ dùng rule.") —
    tries a small fixed set of accepted input formats and returns
    canonical ISO 'YYYY-MM-DD'. Returns None if `raw` is empty or matches
    none of them (the caller/validator decides what that means — this
    function never guesses)."""
    if not raw:
        return None
    text = clean_text(str(raw))
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        # Accepts a full ISO timestamp too, e.g. "2026-08-20T10:00:00Z"
        return datetime.date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def normalize_event_type(raw) -> EventType:
    """Raises ValueError for an unrecognized value — an EditorialEvent's
    `event_type` is a required, strongly-typed field; silently
    substituting a default would hide bad fixture/provider data instead
    of surfacing it (validate_event() would otherwise have to guess why
    a "valid-looking" EventType is actually wrong)."""
    if isinstance(raw, EventType):
        return raw
    key = clean_text(str(raw)).lower().replace("-", "_").replace(" ", "_")
    if key in _EVENT_TYPE_ALIASES:
        return _EVENT_TYPE_ALIASES[key]
    raise ValueError(f"event_type không hợp lệ: {raw!r}")


def normalize_source_tier(raw) -> SourceTier:
    """Same rule-based approach as normalize_event_type, but falls back
    to SourceTier.UNKNOWN instead of raising — an unrecognized *source*
    tier is exactly what "Unknown" (section V) exists to represent, not
    an error condition."""
    if isinstance(raw, SourceTier):
        return raw
    key = clean_text(str(raw or "")).lower().replace("-", "_").replace(" ", "_")
    return _SOURCE_TIER_ALIASES.get(key, SourceTier.UNKNOWN)


class EventNormalizer:
    """Namespace class per section III ("Hoàn thiện EventNormalizer") —
    thin wrappers over the module-level functions above so a Provider can
    do `EventNormalizer.artist(raw)` etc. as one cohesive unit. No logic
    lives here that isn't in one of the functions above (no duplicate
    logic)."""

    artist = staticmethod(normalize_artist)
    title = staticmethod(normalize_title)
    date = staticmethod(normalize_date)
    url = staticmethod(normalize_url)
    platform = staticmethod(normalize_platform)
    event_type = staticmethod(normalize_event_type)
    source_tier = staticmethod(normalize_source_tier)
