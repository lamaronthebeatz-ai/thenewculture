"""Worker Dashboard (Phase 6) — builds the dashboard.json payload:
Pending / Ready / Writing / Review / Published / Cover Story / Top
Story / Issue Planning / Series Balance / Average Confidence / Average
Priority.

Pure re-shaping of what Phase 3 (DashboardEngine, CoverStorySelector,
IssuePlanner) and Phase 5 (MetricsEngine) already compute — this module
adds no new editorial judgment logic of its own, exactly like every
other Phase 6 file ("Chỉ được tích hợp").

"Ready" (decision == PUBLISH, i.e. ready to move into the Workspace
pipeline) and "Published" (Workspace ArticleStatus reached PUBLISHED)
are deliberately two different counts, matching how Phase 4's CLI
`dashboard` command and Phase 5's `workspace` command already use these
two words for two different things.
"""
import statistics
from typing import Any, Dict, List, Optional

from ..editorial.cover_story import CoverStorySelector
from ..editorial.dashboard import DashboardEngine
from ..editorial.issue_planner import IssuePlanner
from ..models.enums import EditorialDecisionType
from ..models.story_candidate import StoryCandidate
from ..workspace.article import Article
from ..workspace.metrics import MetricsEngine


def _series_counts(stories: List[StoryCandidate]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for s in stories:
        if s.decision == EditorialDecisionType.PUBLISH and s.event.suggested_series:
            counts[s.event.suggested_series] = counts.get(s.event.suggested_series, 0) + 1
    return counts


class WorkerDashboardBuilder:
    def __init__(
        self,
        cover_story: Optional[CoverStorySelector] = None,
        dashboard_engine: Optional[DashboardEngine] = None,
        issue_planner: Optional[IssuePlanner] = None,
        metrics_engine: Optional[MetricsEngine] = None,
    ):
        self._cover_story = cover_story or CoverStorySelector()
        self._dashboard = dashboard_engine or DashboardEngine()
        self._issue_planner = issue_planner or IssuePlanner()
        self._metrics = metrics_engine or MetricsEngine()

    def build(self, stories: List[StoryCandidate], articles: List[Article]) -> Dict[str, Any]:
        dash_stats = self._dashboard.compute(stories)
        metrics = self._metrics.compute(articles)
        confidences = [s.event.confidence for s in stories]
        priorities = [s.priority_score for s in stories]
        cover_candidates = self._cover_story.candidates(stories, limit=1)
        top_story = max(stories, key=lambda s: s.priority_score) if stories else None

        counts = _series_counts(stories)
        balance = self._issue_planner.series_balance_report(counts)
        suggestions = self._issue_planner.suggest_for_issue(stories, counts, limit=5)

        return {
            "pending": metrics.pending,
            "ready": dash_stats.published,
            "writing": metrics.writing,
            "review": metrics.review,
            "published": metrics.published,
            "cover_story": cover_candidates[0].event.title if cover_candidates else None,
            "top_story": top_story.event.title if top_story else None,
            "issue_planning": [
                {"title": s.event.title, "priority": s.priority_score, "series": s.event.suggested_series}
                for s in suggestions
            ],
            "series_balance": balance,
            "average_confidence": statistics.mean(confidences) if confidences else None,
            "average_priority": statistics.mean(priorities) if priorities else None,
        }
