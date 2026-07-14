"""Duplicate Engine (sections VIII/IV).

Compares: Artist, Event Type, Release Date, Title, Platform, URL (URL
added in Phase 2, section IV). Two different Providers routinely report
the same real-world happening (e.g. an album release picked up by both
"Spotify Releases" and "Official Website") — those must collapse into
one EditorialEvent with combined sources, not sit in the queue as two
entries an editor has to notice are the same thing themselves.
"""
from difflib import SequenceMatcher
from typing import List, Optional, Tuple

from ..models.enums import EventStatus, SourceTier
from ..models.event import EditorialEvent
from ..models.source import Source

_TITLE_SIMILARITY_THRESHOLD = 0.85

# Lower rank = more trustworthy. Used only to pick `primary_source`
# (section IV) — never for confidence scoring, which stays entirely in
# events/confidence.py / config/confidence_weights.yaml.
_TIER_RANK = {
    SourceTier.TIER_1: 0,
    SourceTier.TIER_2: 1,
    SourceTier.TIER_3: 2,
    SourceTier.UNKNOWN: 3,
}


def _normalize(text: Optional[str]) -> str:
    return (text or "").strip().lower()


def _titles_match(a: str, b: str) -> bool:
    a, b = _normalize(a), _normalize(b)
    if not a or not b:
        return False
    if a == b:
        return True
    return SequenceMatcher(None, a, b).ratio() >= _TITLE_SIMILARITY_THRESHOLD


def _event_urls(event: EditorialEvent) -> set:
    return {_normalize(s.url) for s in event.sources if s.url}


def _urls_match(a: EditorialEvent, b: EditorialEvent) -> bool:
    urls_a, urls_b = _event_urls(a), _event_urls(b)
    return bool(urls_a and urls_b and (urls_a & urls_b))


def _select_primary_source(sources: List[Source]) -> Optional[Source]:
    """Section IV: "Sau merge: sources[], confidence, primary_source."
    Picks the single most trustworthy Source among all of an event's
    sources (lowest tier rank; first-seen breaks ties, for a
    deterministic result independent of dict/set ordering)."""
    if not sources:
        return None
    return min(sources, key=lambda s: _TIER_RANK.get(s.tier, 99))


class DuplicateEngine:
    """Artist + Event Type are mandatory matches (two different artists,
    or an Album Release vs a Concert, can never be "the same event"). Of
    the remaining four signals (Release Date, Title, Platform, URL), at
    least two must also agree — tolerant of one source omitting a date
    or phrasing the title slightly differently, per real-world Provider
    variance, while still refusing to merge on a single coincidental
    match."""

    def is_duplicate(self, a: EditorialEvent, b: EditorialEvent) -> bool:
        if _normalize(a.artist) != _normalize(b.artist):
            return False
        if a.event_type != b.event_type:
            return False

        secondary_matches = 0
        if a.published_at and b.published_at and _normalize(a.published_at) == _normalize(b.published_at):
            secondary_matches += 1
        if _titles_match(a.title, b.title):
            secondary_matches += 1
        if a.platform and b.platform and _normalize(a.platform) == _normalize(b.platform):
            secondary_matches += 1
        if _urls_match(a, b):
            secondary_matches += 1

        return secondary_matches >= 2

    def find_duplicate(self, event: EditorialEvent, existing: List[EditorialEvent]) -> Optional[EditorialEvent]:
        for candidate in existing:
            if candidate.status == EventStatus.MERGED:
                continue
            if self.is_duplicate(event, candidate):
                return candidate
        return None

    def merge(self, primary: EditorialEvent, duplicate: EditorialEvent) -> EditorialEvent:
        """Folds `duplicate` into `primary` in place. `primary` keeps its
        id/status lineage; `duplicate` is marked MERGED (kept for audit,
        section II's EventStatus docstring) and must be dropped from any
        active queue by the caller. Section IV: after merging,
        `primary.sources`/`primary.confidence`/`primary.primary_source`
        must all reflect the combined evidence — sources merge here;
        confidence is recomputed right after by ConfidenceEngine.apply()
        in the same CollectorPipeline step (see collector/pipeline.py),
        not duplicated here; primary_source is (re)selected here since it
        depends only on the now-combined `sources`."""
        for source in duplicate.sources:
            primary.add_source(source)
        for artist in duplicate.related_artists:
            if artist not in primary.related_artists:
                primary.related_artists.append(artist)
        for profile in duplicate.related_profiles:
            if profile not in primary.related_profiles:
                primary.related_profiles.append(profile)
        for tag in duplicate.suggested_tags:
            if tag not in primary.suggested_tags:
                primary.suggested_tags.append(tag)
        duplicate.status = EventStatus.MERGED
        primary.primary_source = _select_primary_source(primary.sources)
        return primary

    def process(self, event: EditorialEvent, existing: List[EditorialEvent]) -> Tuple[EditorialEvent, bool]:
        """Returns (event_to_keep, was_merged). If a duplicate is found,
        `event` is merged into it and `was_merged=True`; otherwise
        `event` itself is returned unchanged with `was_merged=False`.
        Either way, the returned event's `primary_source` is set (section
        IV) — merge() sets it as part of merging; the non-merged branch
        below sets it too, so every event leaving the Duplicate Engine
        has one, not just merged ones."""
        duplicate_of = self.find_duplicate(event, existing)
        if duplicate_of is None:
            event.primary_source = _select_primary_source(event.sources)
            return event, False
        return self.merge(duplicate_of, event), True
