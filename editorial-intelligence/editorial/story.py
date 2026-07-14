"""Story Layer (Phase 3, section 1): EditorialEvent -> StoryCandidate.

Rule-based only: a default event_type -> StoryType map
(config/story_classification.yaml) plus one override rule ("Breaking" —
recent + high-confidence + an eligible event_type). `override` lets a
human/future phase assign Feature/Review/Profile/Editorial explicitly,
since those four StoryTypes represent an editorial judgement call the
raw event_type alone can't determine (see the YAML file's own comment).
"""
import datetime
from typing import Dict, Optional

from ..config.loader import load_story_classification
from ..models.enums import StoryType
from ..models.event import EditorialEvent
from ..models.story_candidate import StoryCandidate


class StoryLayer:
    def __init__(self, rules: Optional[Dict] = None):
        self._rules = rules if rules is not None else load_story_classification()

    def classify(
        self,
        event: EditorialEvent,
        reference_date: Optional[datetime.date] = None,
        override: Optional[StoryType] = None,
    ) -> StoryType:
        if override is not None:
            return override

        if self._is_breaking(event, reference_date):
            return StoryType.BREAKING

        default_map = self._rules.get("default_by_event_type", {})
        return StoryType(default_map.get(event.event_type.value, StoryType.EDITORIAL.value))

    def _is_breaking(self, event: EditorialEvent, reference_date: Optional[datetime.date]) -> bool:
        eligible = self._rules.get("breaking_eligible_event_types", [])
        if event.event_type.value not in eligible:
            return False
        if event.confidence < self._rules.get("breaking_min_confidence", 0):
            return False
        if not event.published_at:
            return False
        try:
            published = datetime.date.fromisoformat(str(event.published_at)[:10])
        except ValueError:
            return False

        today = reference_date or datetime.date.today()
        within_days = self._rules.get("breaking_within_days", 0)
        delta_days = (today - published).days
        return 0 <= delta_days <= within_days

    def build(
        self,
        event: EditorialEvent,
        reference_date: Optional[datetime.date] = None,
        override: Optional[StoryType] = None,
    ) -> StoryCandidate:
        story_type = self.classify(event, reference_date=reference_date, override=override)
        return StoryCandidate(event=event, story_type=story_type)
