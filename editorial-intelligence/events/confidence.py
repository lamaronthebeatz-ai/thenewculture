"""Confidence Engine (section VII).

Scores how trustworthy an EditorialEvent is, purely from which Sources
back it — never from the content of the event itself (that is an
editorial judgement call, not this engine's job). Below the configured
threshold, an event is marked LOW_CONFIDENCE and the Prompt Generator
refuses to build a prompt for it (see prompt/generator.py).
"""
from collections import Counter
from typing import Dict

from ..config.loader import load_confidence_weights, source_tier_lookup
from ..models.enums import EventStatus
from ..models.event import EditorialEvent


class ConfidenceEngine:
    """Constructor-injected with the weight table and source->tier lookup
    so tests can supply a fixed table instead of reading the real YAML
    (dependency injection, per section XIV)."""

    def __init__(self, weights: Dict = None, tier_lookup: Dict[str, str] = None):
        self._weights = weights if weights is not None else load_confidence_weights()
        self._tier_lookup = tier_lookup if tier_lookup is not None else source_tier_lookup()

    def score(self, event: EditorialEvent) -> int:
        """Pure function of event.sources — does not mutate the event.
        Use `apply()` to score AND update event.confidence/status
        together, which is what collector/pipeline.py actually calls."""
        if not event.sources:
            return 0

        source_weights: Dict[str, int] = self._weights.get("source_weights", {})
        tier_weights: Dict[str, int] = self._weights.get("default_tier_weights", {})
        duplicate_bonus: int = self._weights.get("duplicate_source_bonus", 0)

        occurrences = Counter(s.key() for s in event.sources)
        total = 0
        seen_names = set()
        for s in event.sources:
            if s.name in seen_names:
                continue
            seen_names.add(s.name)
            if s.name in source_weights:
                total += source_weights[s.name]
            else:
                tier = self._tier_lookup.get(s.name, s.tier.value)
                total += tier_weights.get(tier, 0)

        duplicate_occurrences = sum(count - 1 for count in occurrences.values() if count > 1)
        total += duplicate_occurrences * duplicate_bonus

        return total

    def threshold(self) -> int:
        return self._weights.get("prompt_eligibility_threshold", 0)

    def apply(self, event: EditorialEvent) -> EditorialEvent:
        """Scores the event and updates its `confidence`/`status` in
        place, then returns it (for easy chaining in the pipeline)."""
        event.confidence = self.score(event)
        if event.confidence < self.threshold():
            event.status = EventStatus.LOW_CONFIDENCE
        elif event.status == EventStatus.DISCOVERED:
            event.status = EventStatus.PENDING_REVIEW
        return event

    def is_prompt_eligible(self, event: EditorialEvent) -> bool:
        """Section VII: "Nếu Confidence thấp. Không đề xuất Prompt." —
        the one gate prompt/generator.py must always check first."""
        return event.confidence >= self.threshold()
