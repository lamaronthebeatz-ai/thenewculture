"""Assignment Generator (Phase 3, section 4).

Series/Category/Tags/Profiles are read straight from Phase 2's
MappingResult (event.mapping_result) — not recomputed here, no
duplicate logic. Suggested Length is the one genuinely new piece of
data (config/assignment_rules.yaml, keyed by StoryType). Internal Links
delegate to RecommendationEngine (section 7), injected via constructor
(Dependency Injection) so this class never re-implements that logic
either.
"""
from typing import Dict, List, Optional

from ..config.loader import load_assignment_rules
from ..models.story_candidate import EditorialAssignment, StoryCandidate
from .recommendation import RecommendationEngine


class AssignmentGenerator:
    def __init__(self, rules: Optional[Dict] = None, recommendation_engine: Optional[RecommendationEngine] = None):
        self._rules = rules if rules is not None else load_assignment_rules()
        self._recommendation_engine = recommendation_engine or RecommendationEngine()

    def generate(self, story: StoryCandidate, pool: Optional[List[StoryCandidate]] = None) -> EditorialAssignment:
        event = story.event
        mapping = event.mapping_result
        recs = self._recommendation_engine.recommend(story, pool)

        assignment = EditorialAssignment(
            suggested_series=mapping.series if mapping else event.suggested_series,
            suggested_category=mapping.category if mapping else None,
            suggested_tags=list(mapping.tags) if mapping else list(event.suggested_tags),
            suggested_profiles=list(mapping.profiles) if mapping else [],
            suggested_internal_links=list(recs.internal_links),
            suggested_length=self._rules.get("suggested_length_by_story_type", {}).get(story.story_type.value),
        )
        story.assignment = assignment
        return assignment
