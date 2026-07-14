"""Duplicate Engine (section VIII).

Compares: Artist, Event Type, Release Date, Title, Platform. Two
different Providers routinely report the same real-world happening
(e.g. an album release picked up by both "Spotify Releases" and
"Official Website") — those must collapse into one EditorialEvent with
combined sources, not sit in the queue as two entries an editor has to
notice are the same thing themselves.
"""
from difflib import SequenceMatcher
from typing import List, Optional, Tuple

from ..models.enums import EventStatus
from ..models.event import EditorialEvent

_TITLE_SIMILARITY_THRESHOLD = 0.85


def _normalize(text: Optional[str]) -> str:
    return (text or "").strip().lower()


def _titles_match(a: str, b: str) -> bool:
    a, b = _normalize(a), _normalize(b)
    if not a or not b:
        return False
    if a == b:
        return True
    return SequenceMatcher(None, a, b).ratio() >= _TITLE_SIMILARITY_THRESHOLD


class DuplicateEngine:
    """Artist + Event Type are mandatory matches (two different artists,
    or an Album Release vs a Concert, can never be "the same event"). Of
    the remaining three signals (Release Date, Title, Platform), at
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
        active queue by the caller."""
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
        return primary

    def process(self, event: EditorialEvent, existing: List[EditorialEvent]) -> Tuple[EditorialEvent, bool]:
        """Returns (event_to_keep, was_merged). If a duplicate is found,
        `event` is merged into it and `was_merged=True`; otherwise
        `event` itself is returned unchanged with `was_merged=False`."""
        duplicate_of = self.find_duplicate(event, existing)
        if duplicate_of is None:
            return event, False
        return self.merge(duplicate_of, event), True
