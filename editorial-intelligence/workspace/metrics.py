"""Metrics (Phase 5) — pure aggregate computation over a Workspace's
Articles. Same pattern as editorial/dashboard.py (Phase 3): a pure
function of current state, never mutates anything.
"""
import statistics
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from .article import Article
from .history import HistoryEntry
from .status import ArticleStatus, TRANSITION_LABELS


@dataclass(frozen=True)
class WorkspaceMetrics:
    pending: int
    writing: int
    review: int
    published: int
    average_writing_time_hours: Optional[float]
    average_review_time_hours: Optional[float]
    series_distribution: Dict[str, int] = field(default_factory=dict)
    story_type_distribution: Dict[str, int] = field(default_factory=dict)


def _find_entry(history: List[HistoryEntry], status: ArticleStatus) -> Optional[HistoryEntry]:
    label = TRANSITION_LABELS[status]
    for entry in history:
        if entry.label == label:
            return entry
    return None


def _hours_between(start: str, end: str) -> Optional[float]:
    try:
        t0 = datetime.fromisoformat(start)
        t1 = datetime.fromisoformat(end)
    except (TypeError, ValueError):
        return None
    return (t1 - t0).total_seconds() / 3600.0


class MetricsEngine:
    def compute(self, articles: List[Article]) -> WorkspaceMetrics:
        pending = sum(
            1 for a in articles if a.status in (ArticleStatus.NEW, ArticleStatus.PENDING_REVIEW)
        )
        writing = sum(
            1 for a in articles if a.status in (ArticleStatus.PROMPT_READY, ArticleStatus.WRITING)
        )
        review = sum(
            1 for a in articles
            if a.status in (ArticleStatus.DRAFT_READY, ArticleStatus.EDITOR_REVIEW, ArticleStatus.READY_TO_PUBLISH)
        )
        published = sum(1 for a in articles if a.status in (ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED))

        writing_times: List[float] = []
        review_times: List[float] = []
        for a in articles:
            start_writing = _find_entry(a.history, ArticleStatus.WRITING)
            draft_ready = _find_entry(a.history, ArticleStatus.DRAFT_READY)
            if start_writing and draft_ready:
                hours = _hours_between(start_writing.timestamp, draft_ready.timestamp)
                if hours is not None:
                    writing_times.append(hours)

            editor_review = _find_entry(a.history, ArticleStatus.EDITOR_REVIEW)
            ready_to_publish = _find_entry(a.history, ArticleStatus.READY_TO_PUBLISH)
            if editor_review and ready_to_publish:
                hours = _hours_between(editor_review.timestamp, ready_to_publish.timestamp)
                if hours is not None:
                    review_times.append(hours)

        series_distribution: Dict[str, int] = {}
        story_type_distribution: Dict[str, int] = {}
        for a in articles:
            key = a.series or "(chưa xác định)"
            series_distribution[key] = series_distribution.get(key, 0) + 1
            story_type_distribution[a.story_type.value] = story_type_distribution.get(a.story_type.value, 0) + 1

        return WorkspaceMetrics(
            pending=pending,
            writing=writing,
            review=review,
            published=published,
            average_writing_time_hours=statistics.mean(writing_times) if writing_times else None,
            average_review_time_hours=statistics.mean(review_times) if review_times else None,
            series_distribution=series_distribution,
            story_type_distribution=story_type_distribution,
        )
