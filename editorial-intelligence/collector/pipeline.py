"""CollectorPipeline — the one place that wires Providers, the Duplicate
Engine, the Confidence Engine, Editorial Mapping and the EventQueue
together.

Every dependency is injected through the constructor (section XIV:
"Dependency Injection nếu cần") — this class never constructs a
ProviderRegistry or reaches for a global. That is what makes it possible
to unit test with a fake provider and an in-memory queue with no I/O at
all (see tests/test_pipeline.py), and what will let Phase 1.1 swap in a
persistent EventQueue implementation without touching this file.
"""
from typing import List, Optional

from ..events.confidence import ConfidenceEngine
from ..events.duplicate import DuplicateEngine
from ..events.mapping import EditorialMappingEngine
from ..models.event import EditorialEvent
from ..providers.registry import ProviderRegistry
from ..queue.interface import EventQueue


class CollectorPipeline:
    def __init__(
        self,
        registry: ProviderRegistry,
        event_queue: EventQueue,
        confidence_engine: Optional[ConfidenceEngine] = None,
        duplicate_engine: Optional[DuplicateEngine] = None,
        mapping_engine: Optional[EditorialMappingEngine] = None,
    ) -> None:
        self._registry = registry
        self._queue = event_queue
        self._confidence = confidence_engine or ConfidenceEngine()
        self._duplicate = duplicate_engine or DuplicateEngine()
        self._mapping = mapping_engine or EditorialMappingEngine()

    def run(self) -> List[EditorialEvent]:
        """Runs collect() on every registered Provider, then for each
        resulting Event, in order:

          1. Duplicate Engine  — merge into an existing queued event if
             one matches (section VIII); otherwise keep as-is.
          2. Confidence Engine — score sources, set status
             PENDING_REVIEW or LOW_CONFIDENCE (section VII).
          3. Editorial Mapping — attach suggested_series/suggested_tags
             plus the full MappingResult (category/profiles/homepage/
             magazine/related_series/search_weight — section VI; calls
             EditorialMappingEngine.apply_full(), which internally calls
             apply() so the Phase 1 fields are set exactly as before).
          4. Push (or re-push, if merged) into the EventQueue.

        Returns only the events that were newly added this run (not
        those absorbed into an existing one via merge), for a caller
        that just wants "what's new".
        """
        newly_added: List[EditorialEvent] = []
        for provider in self._registry.all():
            for event in provider.collect():
                kept, was_merged = self._duplicate.process(event, self._queue.all())
                self._confidence.apply(kept)
                self._mapping.apply_full(kept)
                self._queue.push(kept)
                if not was_merged:
                    newly_added.append(kept)
        return newly_added
