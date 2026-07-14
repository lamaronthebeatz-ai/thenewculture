"""Cover Story Candidate selector (Phase 3, section 6).

Only PUBLISH-decision StoryCandidates, of an eligible StoryType, at or
above a minimum Priority Score, qualify — a Community or Timeline story
never becomes a Cover Story pick automatically no matter how high its
priority, since eligible_story_types (config/cover_story_rules.yaml) is
a fixed, small set."""
from typing import Dict, List, Optional

from ..config.loader import load_cover_story_rules
from ..models.enums import EditorialDecisionType
from ..models.story_candidate import StoryCandidate


class CoverStorySelector:
    def __init__(self, rules: Optional[Dict] = None):
        self._rules = rules if rules is not None else load_cover_story_rules()

    def candidates(self, stories: List[StoryCandidate], limit: int = 5) -> List[StoryCandidate]:
        eligible_types = set(self._rules.get("eligible_story_types", []))
        min_priority = self._rules.get("min_priority_score", 0)

        pool = [
            s for s in stories
            if s.story_type.value in eligible_types
            and s.priority_score >= min_priority
            and s.decision == EditorialDecisionType.PUBLISH
        ]
        return sorted(pool, key=lambda s: s.priority_score, reverse=True)[:limit]
