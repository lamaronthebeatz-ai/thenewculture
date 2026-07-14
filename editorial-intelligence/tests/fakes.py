"""Test doubles only. FakeProvider is not a real Source integration — it
returns data handed to it in memory, performs no I/O, and exists solely
to prove the EventProvider contract and the CollectorPipeline wiring
work end to end without needing a real Provider implementation (which
Phase 1 deliberately does not ship — section XVI)."""
from typing import Any, Dict, List

from editorial_intelligence.models.enums import SourceTier
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source
from editorial_intelligence.providers.base import EventProvider, RawPayload


class FakeProvider(EventProvider):
    def __init__(self, source_name: str, raw_records: List[RawPayload]):
        self._source_name = source_name
        self._raw_records = raw_records

    @property
    def source_name(self) -> str:
        return self._source_name

    def fetch(self) -> List[RawPayload]:
        return list(self._raw_records)

    def normalize(self, raw: Dict[str, Any]) -> EditorialEvent:
        event = EditorialEvent.create(
            title=raw["title"],
            artist=raw["artist"],
            event_type=raw["event_type"],
            description=raw.get("description", ""),
            published_at=raw.get("published_at"),
            platform=raw.get("platform"),
            related_artists=list(raw.get("related_artists", [])),
            related_profiles=list(raw.get("related_profiles", [])),
        )
        tier = SourceTier(raw.get("tier", SourceTier.TIER_3.value))
        for source_name in raw.get("sources", [self._source_name]):
            event.add_source(Source(name=source_name, tier=tier))
        return event

    def validate(self, event: EditorialEvent) -> bool:
        return bool(event.title and event.artist)
