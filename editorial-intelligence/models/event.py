"""EditorialEvent — the single central unit of data in this system.

Section III is explicit: this system does not collect articles and does
not store articles. It collects *events* — an Album Release, a Festival
announcement, an Interview going up, etc. Everything downstream (Confidence
Engine, Duplicate Engine, Editorial Mapping, Prompt Generator) operates on
this one model.
"""
import hashlib
from dataclasses import dataclass, field
from typing import List, Optional

from .enums import EventStatus, EventType
from .mapping_result import MappingResult
from .source import Source


def generate_event_id(artist: str, event_type: EventType, title: str, published_at: Optional[str]) -> str:
    """Deterministic id from the facts that define "the same event",
    independent of which Provider found it first. Two Providers reporting
    the same album release must be able to collapse onto the same id
    before the Duplicate Engine even needs to compare fields — this is a
    cheap first pass, not a replacement for events/duplicate.py (which
    also has to catch near-duplicates where these fields differ slightly)."""
    basis = "|".join([
        artist.strip().lower(),
        event_type.value,
        title.strip().lower(),
        (published_at or "").strip(),
    ])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:16]


@dataclass
class EditorialEvent:
    id: str
    title: str
    artist: str
    event_type: EventType
    description: str
    published_at: Optional[str] = None  # ISO 8601 date, e.g. "2026-07-20"

    sources: List[Source] = field(default_factory=list)
    confidence: int = 0

    language: str = "vi"
    country: str = "VN"
    platform: Optional[str] = None
    image: Optional[str] = None

    status: EventStatus = EventStatus.DISCOVERED

    related_artists: List[str] = field(default_factory=list)
    related_profiles: List[str] = field(default_factory=list)

    suggested_series: Optional[str] = None
    suggested_tags: List[str] = field(default_factory=list)

    # --- Phase 2 additions (additive only — every field above is exactly
    # as Phase 1 left it; both fields below default to None so any code
    # that already constructs an EditorialEvent without them, including
    # every Phase 1 test, is unaffected). ---
    primary_source: Optional[Source] = None  # set by events/duplicate.py, section IV
    mapping_result: Optional[MappingResult] = None  # set by events/mapping.py, section VI

    @classmethod
    def create(cls, *, title: str, artist: str, event_type: EventType,
               description: str, published_at: Optional[str] = None, **kwargs) -> "EditorialEvent":
        """Preferred constructor: derives `id` instead of trusting a
        caller-supplied one, so two independently-built events describing
        the same real-world happening are structurally comparable."""
        return cls(
            id=generate_event_id(artist, event_type, title, published_at),
            title=title,
            artist=artist,
            event_type=event_type,
            description=description,
            published_at=published_at,
            **kwargs,
        )

    def add_source(self, source: Source) -> None:
        """Append-only, deliberately NOT deduplicated here: the Confidence
        Engine (events/confidence.py) needs to see repeat occurrences of
        the same named source to score the "Duplicate Sources" signal
        (section VII). Collapsing distinct-but-equal sources only happens
        when two whole Events are merged (events/duplicate.py), which is
        a different operation from adding one more observation to one
        Event."""
        self.sources.append(source)

    def unique_source_names(self) -> List[str]:
        seen: List[str] = []
        for s in self.sources:
            if s.name not in seen:
                seen.append(s.name)
        return seen
