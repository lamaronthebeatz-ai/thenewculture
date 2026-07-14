"""Issue Planner (Phase 3, section 5).

Operates purely on Editorial Intelligence's own StoryCandidate pool plus
a caller-supplied count of stories already slated per Series for the
current issue. Has NO access to and never reads the real
content/magazine/*.md or scripts/magazine.py — independence rule, same
as every other module here. "The current issue" is just a
`Dict[str, int]` the caller provides (e.g. counted from wherever the
real editorial workflow tracks it) — Editorial Intelligence does not
know or care how that count was produced.
"""
from typing import Dict, List, Optional

from ..config.loader import load_issue_balance
from ..models.enums import EditorialDecisionType
from ..models.story_candidate import StoryCandidate


class IssuePlanner:
    def __init__(self, balance_config: Optional[Dict] = None):
        self._config = balance_config if balance_config is not None else load_issue_balance()

    def _target_for(self, series: Optional[str]) -> int:
        targets = self._config.get("target_distribution", {})
        default = self._config.get("default_target", 0)
        if series is None:
            return default
        return targets.get(series, default)

    def series_balance_report(self, current_counts: Dict[str, int]) -> Dict[str, Dict[str, int]]:
        """target/current/gap (target - current; positive = thiếu, âm =
        thừa) cho mọi Series đã cấu hình hoặc đã có bài trong issue hiện
        tại."""
        targets = self._config.get("target_distribution", {})
        all_series = set(targets) | set(current_counts)
        return {
            series: {
                "target": self._target_for(series),
                "current": current_counts.get(series, 0),
                "gap": self._target_for(series) - current_counts.get(series, 0),
            }
            for series in all_series
        }

    def suggest_for_issue(
        self,
        stories: List[StoryCandidate],
        current_counts: Dict[str, int],
        limit: Optional[int] = None,
    ) -> List[StoryCandidate]:
        """Chỉ xét story đã quyết định PUBLISH. Ưu tiên Series đang thiếu
        nhiều nhất so với target trước; trong cùng mức thiếu, Priority
        Score cao hơn đứng trước."""
        publishable = [s for s in stories if s.decision == EditorialDecisionType.PUBLISH]

        def sort_key(story: StoryCandidate):
            series = story.event.suggested_series
            gap = self._target_for(series) - current_counts.get(series, 0)
            return (-gap, -story.priority_score)

        ranked = sorted(publishable, key=sort_key)
        return ranked[:limit] if limit is not None else ranked
