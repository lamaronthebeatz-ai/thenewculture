"""Dashboard Data (Phase 3, section 8) — simple rule-based aggregate
counts over a StoryCandidate pool. Pure function of the pool's current
state; does not mutate anything."""
from typing import Dict, List, Optional

from ..config.loader import load_dashboard_config
from ..models.dashboard_stats import DashboardStats
from ..models.enums import EditorialDecisionType, EventStatus
from ..models.story_candidate import StoryCandidate


class DashboardEngine:
    def __init__(self, config: Optional[Dict] = None):
        self._config = config if config is not None else load_dashboard_config()

    def compute(self, stories: List[StoryCandidate]) -> DashboardStats:
        high_priority_threshold = self._config.get("high_priority_threshold", 0)

        pending = sum(
            1 for s in stories
            if s.decision in (EditorialDecisionType.HOLD, EditorialDecisionType.NEED_MORE_SOURCES)
        )
        high_priority = sum(1 for s in stories if s.priority_score >= high_priority_threshold)
        low_confidence = sum(1 for s in stories if s.event.status == EventStatus.LOW_CONFIDENCE)
        duplicate = sum(1 for s in stories if s.decision == EditorialDecisionType.MERGE)
        published = sum(1 for s in stories if s.decision == EditorialDecisionType.PUBLISH)
        rejected = sum(1 for s in stories if s.decision == EditorialDecisionType.REJECT)

        return DashboardStats(
            pending=pending,
            high_priority=high_priority,
            low_confidence=low_confidence,
            duplicate=duplicate,
            published=published,
            rejected=rejected,
        )
