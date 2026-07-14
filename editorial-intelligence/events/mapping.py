"""Editorial Mapping (section IX, extended by Phase 2 section VI).

Maps an EventType to a suggested Series slug and a small set of suggested
tags. This engine only ever *suggests* — it never writes to
admin/config.yml, never creates a Series, and the mapping table itself
is pure config data (config/editorial_mapping.yaml +, since Phase 2,
config/event_categories.yaml), not Python conditionals, so extending it
is a data change (section IX: "Có thể mở rộng").

Phase 1's `apply()`/`suggest_series()`/`suggest_tags()` are UNCHANGED —
`apply_full()` below is new, reuses `apply()` internally, and produces
the richer 9-field MappingResult section VI asks for
(category/series/profiles/tags/homepage/magazine/related_profiles/
related_series/search_weight).
"""
import re
import unicodedata
from typing import Dict, List, Optional

from ..config.loader import load_editorial_mapping, load_event_categories
from ..models.event import EditorialEvent
from ..models.mapping_result import MappingResult

# Matches the real tag style already used across content/articles/*.md,
# e.g. "#TNC", "#TNCOrigins", "#Gfamily" — no spaces, no punctuation.
_TAG_UNSAFE = re.compile(r"[^a-zA-Z0-9]+")


def _to_tag(text: str) -> str:
    """NFD-decompose before stripping non-ASCII, same technique
    `scripts/build.py`'s `slugify()` uses for Vietnamese text — dropping
    accents straight from the composed string (e.g. a plain regex over
    "Nghệ") deletes the accented letter entirely ("Ngh"), not just its
    diacritic. NFD splits the base letter from its combining mark first,
    so only the mark is dropped and "Nghệ" becomes "Nghe", not "Ngh"."""
    ascii_text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    return "#" + _TAG_UNSAFE.sub("", ascii_text)


def _slugify_profile(text: str) -> str:
    """Same NFD technique as _to_tag, but hyphenated/lowercase — matching
    the real profile filename convention (content/profiles/*.md, e.g.
    "viet-dragon.md", "2pillz.md"), not the tag convention. A separate
    function rather than reusing _to_tag because the two output shapes
    are genuinely different (hyphenated-lowercase vs concatenated-cased),
    not because the underlying accent-stripping technique differs."""
    ascii_text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()


def _dedupe(items: List[str]) -> List[str]:
    seen: List[str] = []
    for item in items:
        if item and item not in seen:
            seen.append(item)
    return seen


class EditorialMappingEngine:
    def __init__(self, mapping: Optional[Dict[str, str]] = None, categories: Optional[Dict] = None):
        self._mapping = mapping if mapping is not None else load_editorial_mapping()
        self._categories = categories if categories is not None else load_event_categories()

    def suggest_series(self, event: EditorialEvent) -> Optional[str]:
        return self._mapping.get(event.event_type.value)

    def suggest_tags(self, event: EditorialEvent) -> List[str]:
        tags = ["#TNC"]
        if event.artist:
            tags.append(_to_tag(event.artist))
        series = self.suggest_series(event)
        if series:
            # "tnc-records" -> "TNCRecords" -> "#TNCRecords"
            tags.append(_to_tag(series.replace("-", " ").title()))
        # de-dupe, preserve order
        seen = []
        for t in tags:
            if t not in seen and t != "#":
                seen.append(t)
        return seen

    def apply(self, event: EditorialEvent) -> EditorialEvent:
        event.suggested_series = self.suggest_series(event)
        event.suggested_tags = self.suggest_tags(event)
        return event

    def apply_full(self, event: EditorialEvent) -> MappingResult:
        """Section VI: category, series, profiles, tags, homepage,
        magazine, related_profiles, related_series, search_weight — all
        rule-based from config/event_categories.yaml, no AI. Calls
        `apply()` first (reused, not duplicated) so
        `suggested_series`/`suggested_tags` are set exactly as Phase 1
        always set them; the result is additionally stored on
        `event.mapping_result`."""
        self.apply(event)
        event_type = event.event_type.value

        category = self._categories.get("categories", {}).get(event_type, "Uncategorized")
        related_series = list(self._categories.get("related_series", {}).get(event_type, []))

        homepage = (
            event_type in self._categories.get("homepage_eligible_event_types", [])
            and event.confidence >= self._categories.get("homepage_confidence_threshold", 0)
        )
        magazine = (
            event_type in self._categories.get("magazine_eligible_event_types", [])
            and event.confidence >= self._categories.get("magazine_confidence_threshold", 0)
        )

        base = self._categories.get("search_weight_base", 0)
        multiplier = self._categories.get("search_weight_confidence_multiplier", 0)
        search_weight = int(base + event.confidence * multiplier)

        profiles = _dedupe(([_slugify_profile(event.artist)] if event.artist else []) + list(event.related_profiles))

        result = MappingResult(
            category=category,
            series=event.suggested_series,
            profiles=profiles,
            tags=list(event.suggested_tags),
            homepage=homepage,
            magazine=magazine,
            related_profiles=list(event.related_profiles),
            related_series=related_series,
            search_weight=search_weight,
        )
        event.mapping_result = result
        return result
