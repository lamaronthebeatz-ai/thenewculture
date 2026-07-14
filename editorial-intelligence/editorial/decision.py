"""Editorial Decision (Phase 3, section 3) — deterministic rule tree,
first match wins. Status-based facts already known from the Phase 1/2
Collector pipeline (REJECTED/MERGED/LOW_CONFIDENCE) always take
precedence over a Priority-Score judgement call — a merged or rejected
event is never re-decided into PUBLISH just because its priority looks
good.
"""
from typing import Dict, Optional

from ..config.loader import load_editorial_decision_rules
from ..models.enums import EditorialDecisionType, EventStatus
from ..models.story_candidate import StoryCandidate


class EditorialDecisionEngine:
    def __init__(self, rules: Optional[Dict] = None):
        self._rules = rules if rules is not None else load_editorial_decision_rules()

    def decide(self, story: StoryCandidate) -> StoryCandidate:
        event = story.event
        publish_threshold = self._rules.get("publish_priority_threshold", 0)
        hold_threshold = self._rules.get("hold_priority_threshold", 0)

        if event.status == EventStatus.REJECTED:
            story.decision = EditorialDecisionType.REJECT
            story.decision_reason = "Event đã bị editor từ chối (EventStatus.REJECTED)."
        elif event.status == EventStatus.MERGED:
            story.decision = EditorialDecisionType.MERGE
            story.decision_reason = "Event đã được gộp vào 1 event khác (Duplicate Engine, Phase 2)."
        elif event.status == EventStatus.LOW_CONFIDENCE:
            story.decision = EditorialDecisionType.NEED_MORE_SOURCES
            story.decision_reason = f"Confidence {event.confidence} dưới ngưỡng Prompt (Confidence Engine) — cần thêm nguồn xác thực."
        elif story.priority_score >= publish_threshold:
            story.decision = EditorialDecisionType.PUBLISH
            story.decision_reason = f"Priority Score {story.priority_score} >= ngưỡng publish {publish_threshold}."
        elif story.priority_score >= hold_threshold:
            story.decision = EditorialDecisionType.HOLD
            story.decision_reason = (
                f"Priority Score {story.priority_score} trong khoảng hold "
                f"({hold_threshold}-{publish_threshold})."
            )
        else:
            story.decision = EditorialDecisionType.NEED_MORE_SOURCES
            story.decision_reason = f"Priority Score {story.priority_score} dưới ngưỡng hold {hold_threshold}."

        return story
