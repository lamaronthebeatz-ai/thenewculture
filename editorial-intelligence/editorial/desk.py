"""EditorialDesk (Phase 3 orchestrator).

NOT part of CollectorPipeline (collector/pipeline.py, Phase 1 — zero
lines changed there). Runs strictly AFTER the Collector pipeline has
already scored/deduped/mapped EditorialEvents into the EventQueue: takes
already-processed events and, for each one, runs Story Layer -> Priority
Engine -> Editorial Decision -> Assignment Generator, in that order.

Issue Planner / Cover Story Candidate / Recommendation Engine (standalone
use) / Dashboard Data are POOL-level operations — they need to see many
StoryCandidates at once to compare/balance/rank them, so they are
deliberately NOT part of this per-story sequence. Call them directly
with the list process_all() returns (see docs/editorial-intelligence.md,
"Phase 3 flow").
"""
from typing import List, Optional

from ..models.event import EditorialEvent
from ..models.story_candidate import StoryCandidate
from .assignment import AssignmentGenerator
from .decision import EditorialDecisionEngine
from .priority import PriorityEngine
from .story import StoryLayer


class EditorialDesk:
    def __init__(
        self,
        story_layer: Optional[StoryLayer] = None,
        priority_engine: Optional[PriorityEngine] = None,
        decision_engine: Optional[EditorialDecisionEngine] = None,
        assignment_generator: Optional[AssignmentGenerator] = None,
    ):
        self._story_layer = story_layer or StoryLayer()
        self._priority = priority_engine or PriorityEngine()
        self._decision = decision_engine or EditorialDecisionEngine()
        self._assignment = assignment_generator or AssignmentGenerator()

    def process(self, event: EditorialEvent, pool: Optional[List[StoryCandidate]] = None) -> StoryCandidate:
        """Single-event path — `pool` (for Assignment's Internal Links,
        via RecommendationEngine) defaults to just this one story if not
        supplied."""
        story = self._story_layer.build(event)
        self._priority.apply(story)
        self._decision.decide(story)
        self._assignment.generate(story, pool=pool if pool is not None else [story])
        return story

    def process_all(self, events: List[EditorialEvent]) -> List[StoryCandidate]:
        """Batch path, two passes: classify+score+decide every event
        first, THEN run Assignment (so RecommendationEngine's Related
        Articles can see the whole batch, not just stories processed so
        far)."""
        stories: List[StoryCandidate] = []
        for event in events:
            story = self._story_layer.build(event)
            self._priority.apply(story)
            self._decision.decide(story)
            stories.append(story)
        for story in stories:
            self._assignment.generate(story, pool=stories)
        return stories
