"""Provider Interface (section V).

A Provider is the only place in this system allowed to know about an
external source's shape (an API response, a feed entry, whatever it turns
out to be in a later phase). Nothing outside a Provider subclass may ever
see a `RawPayload` — the rest of the system (collector, events, prompt)
only ever deals in `EditorialEvent`.

Phase 1 shipped this interface only. Phase 2 (section I) adds the first
concrete implementation, `providers/news_provider.py`'s `NewsProvider` —
it still performs no network I/O: it reads local JSON fixture files
(tests/fixtures/news/), no crawling, no RSS, no Cloudflare Worker, no
real API (section XVI's constraints still hold).
`editorial-intelligence/tests/fakes.py` also has an in-memory
FakeProvider used solely to prove the pipeline wiring in tests; it is
not a real source and must not be registered outside test code.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List

from ..models.event import EditorialEvent

# A Provider-specific raw record, shape unknown to everything outside the
# Provider that produced it (e.g. one JSON object from a future API
# response). Intentionally opaque here.
RawPayload = Dict[str, Any]


class EventProvider(ABC):
    """One integration with one external source.

    Implementations must stay pure with respect to the rest of the
    system: `fetch()` is the only method allowed to perform I/O. Once
    `collect()` returns, every item is a fully-formed, self-validated
    `EditorialEvent` — per section V, "Provider chỉ trả về Event".
    """

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Must match an entry name in config/sources.yaml, e.g.
        "Spotify Artist" — this is how the Confidence Engine looks up
        this provider's tier/weight without the provider needing to know
        about scoring at all."""
        raise NotImplementedError

    @abstractmethod
    def fetch(self) -> List[RawPayload]:
        """Retrieve raw records from the external source. The ONLY method
        in this class allowed to perform network/file I/O."""
        raise NotImplementedError

    @abstractmethod
    def normalize(self, raw: RawPayload) -> EditorialEvent:
        """Turn one raw record into an EditorialEvent. Must not perform
        I/O; pure data transformation only."""
        raise NotImplementedError

    @abstractmethod
    def validate(self, event: EditorialEvent) -> bool:
        """Structural sanity check (e.g. required fields present) —
        NOT a confidence judgement. An event can validate=True and still
        end up EventStatus.LOW_CONFIDENCE later; those are different
        concerns (see events/confidence.py)."""
        raise NotImplementedError

    def collect(self) -> List[EditorialEvent]:
        """Template method tying the three steps together. Subclasses
        should not need to override this — override fetch/normalize/
        validate instead, to keep every provider's public surface
        identical (this is what lets collector/pipeline.py treat every
        provider interchangeably)."""
        events: List[EditorialEvent] = []
        for raw in self.fetch():
            event = self.normalize(raw)
            if self.validate(event):
                events.append(event)
        return events
