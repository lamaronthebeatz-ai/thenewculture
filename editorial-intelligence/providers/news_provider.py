"""NewsProvider (Phase 2, section I) — the first concrete EventProvider.

Explicitly NOT a crawler: no network call, no HTTP client, no RSS/feed
parsing. `fetch()` only reads local JSON files from a fixture directory
(default: tests/fixtures/news/), one EditorialEvent per file. This is
intentional — Phase 2 is about proving the Collector's real,
non-network-dependent machinery (Normalizer, Validation, Duplicate,
Confidence, Mapping, Queue, Prompt, Markdown) against real data shapes,
not about standing up an integration with an actual news source (that
stays out of scope per section XVI, same as Phase 1).
"""
import glob
import json
import os
from typing import List, Set

from ..events.normalizer import EventNormalizer, clean_text, dedupe_preserve_order
from ..events.validation import ValidationError, validate_event
from ..models.event import EditorialEvent
from ..models.source import Source
from .base import EventProvider, RawPayload


class NewsProvider(EventProvider):
    """`fixtures_dir` is constructor-injected (section XIV) — defaults to
    nothing; the caller must point it at a real directory (see
    tests/test_news_provider.py for the reference fixtures under
    tests/fixtures/news/)."""

    def __init__(self, fixtures_dir: str):
        self._fixtures_dir = fixtures_dir
        self._seen_ids: Set[str] = set()

    @property
    def source_name(self) -> str:
        return "News Fixtures"

    def fetch(self) -> List[RawPayload]:
        """The only method here allowed to touch disk — reads every
        *.json file in `fixtures_dir`, in filename order (event_01.json,
        event_02.json, ...), each one whole file = one raw record."""
        self._seen_ids = set()  # fresh dedupe-within-this-batch tracking each fetch
        payloads = []
        for path in sorted(glob.glob(os.path.join(self._fixtures_dir, "*.json"))):
            with open(path, encoding="utf-8") as f:
                payloads.append(json.load(f))
        return payloads

    def normalize(self, raw: RawPayload) -> EditorialEvent:
        """Pure transformation, no I/O. Every field goes through
        EventNormalizer (section III) — nothing here decides "what a
        valid date looks like" itself, that rule lives in
        events/normalizer.py so every future Provider applies the exact
        same rules."""
        event_type = EventNormalizer.event_type(raw["event_type"])
        title = EventNormalizer.title(raw["title"])
        artist = EventNormalizer.artist(raw["artist"])
        published_at = EventNormalizer.date(raw.get("published_at"))
        platform = EventNormalizer.platform(raw.get("platform"))

        event = EditorialEvent.create(
            title=title,
            artist=artist,
            event_type=event_type,
            description=clean_text(raw.get("description", "")),
            published_at=published_at,
            platform=platform,
            image=raw.get("image") or None,
            related_artists=dedupe_preserve_order(raw.get("related_artists", [])),
            related_profiles=dedupe_preserve_order(raw.get("related_profiles", [])),
        )
        for raw_source in raw.get("sources", []):
            event.add_source(Source(
                name=raw_source["name"],
                tier=EventNormalizer.source_tier(raw_source.get("tier")),
                url=EventNormalizer.url(raw_source.get("url")),
                platform=EventNormalizer.platform(raw_source.get("platform")) or platform,
                retrieved_at=raw_source.get("retrieved_at"),
            ))
        return event

    def validate(self, event: EditorialEvent) -> bool:
        """Converts the raising `validate_event()` (section II) into the
        bool the EventProvider interface (Phase 1, unchanged) requires —
        the strict rule-by-rule checks live in events/validation.py so
        every future Provider can reuse them the same way. `existing_ids`
        catches a duplicate id within this single fetch() batch (e.g. two
        fixture files accidentally describing the same event); cross-
        batch/cross-provider duplicates are the Duplicate Engine's job
        (events/duplicate.py), not this per-event check."""
        try:
            validate_event(event, existing_ids=self._seen_ids)
        except ValidationError:
            return False
        self._seen_ids.add(event.id)
        return True
