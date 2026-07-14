"""Recommendation Engine (Phase 3, section 7).

Related Profiles / Related Series reuse Phase 2's MappingResult
(event.mapping_result) — not recomputed, no duplicate logic. Related
Articles means OTHER StoryCandidates already known within the same
`pool` this run — Editorial Intelligence has no access to and never
reads real content/articles/*.md, same independence rule as every other
module here (see models/recommendation.py). Internal Links reuse
EditorialEvent.related_artists, the same signal Phase 1/2's Prompt
Generator already surfaces as "Internal Linking Suggestions".
"""
from typing import List, Optional

from ..models.recommendation import Recommendations
from ..models.story_candidate import StoryCandidate


class RecommendationEngine:
    def recommend(self, story: StoryCandidate, pool: Optional[List[StoryCandidate]] = None) -> Recommendations:
        event = story.event
        mapping = event.mapping_result
        pool = pool or []

        related_articles = [
            other.event.title
            for other in pool
            if other is not story
            and (
                other.event.artist == event.artist
                or (event.suggested_series and other.event.suggested_series == event.suggested_series)
            )
        ]

        return Recommendations(
            related_profiles=list(mapping.related_profiles) if mapping else [],
            related_articles=related_articles,
            related_series=list(mapping.related_series) if mapping else [],
            internal_links=list(event.related_artists),
        )
