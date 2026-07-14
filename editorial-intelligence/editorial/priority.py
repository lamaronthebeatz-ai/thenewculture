"""Priority Engine (Phase 3, section 2).

Deliberately SEPARATE from Confidence Score (events/confidence.py):
Confidence measures "how trustworthy is this information"; Priority
measures "how much editorial attention should this get right now".
Confidence only ever enters here as one weighted input
(confidence_multiplier) — a high-confidence Community update and a
Breaking release are not the same priority even at equal confidence.
All weights come from config/priority_weights.yaml — no hardcoded
numbers in this file.
"""
from typing import Dict, Optional

from ..config.loader import load_priority_weights
from ..models.story_candidate import StoryCandidate


class PriorityEngine:
    def __init__(self, weights: Optional[Dict] = None):
        self._weights = weights if weights is not None else load_priority_weights()

    def score(self, story: StoryCandidate) -> int:
        event = story.event
        story_type_weights = self._weights.get("story_type_weights", {})
        base = story_type_weights.get(story.story_type.value, 0)

        confidence_bonus = event.confidence * self._weights.get("confidence_multiplier", 0)

        homepage_bonus = 0
        magazine_bonus = 0
        mapping = event.mapping_result
        if mapping is not None:
            if mapping.homepage:
                homepage_bonus = self._weights.get("homepage_bonus", 0)
            if mapping.magazine:
                magazine_bonus = self._weights.get("magazine_bonus", 0)

        return int(base + confidence_bonus + homepage_bonus + magazine_bonus)

    def apply(self, story: StoryCandidate) -> StoryCandidate:
        story.priority_score = self.score(story)
        return story
