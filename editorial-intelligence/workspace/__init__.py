"""Workspace layer (Phase 5) — owns the Article's production lifecycle
(NEW -> ... -> ARCHIVED), layered on top of Phase 3's StoryCandidate
without changing it. See docs/editorial-intelligence.md, "Phase 5 flow".
"""
from .archive import ArchiveEngine
from .article import Article
from .export import ExportEngine
from .history import HistoryEngine, HistoryEntry, now_iso
from .metrics import MetricsEngine, WorkspaceMetrics
from .status import ArticleStatus, InvalidTransitionError, StatusEngine, STATUS_ORDER, TRANSITION_LABELS
from .workspace import Workspace

__all__ = [
    "ArchiveEngine",
    "Article",
    "ExportEngine",
    "HistoryEngine",
    "HistoryEntry",
    "now_iso",
    "MetricsEngine",
    "WorkspaceMetrics",
    "ArticleStatus",
    "InvalidTransitionError",
    "StatusEngine",
    "STATUS_ORDER",
    "TRANSITION_LABELS",
    "Workspace",
]
