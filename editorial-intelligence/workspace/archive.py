"""Archive (Phase 5) — the deliberate, explicit final step
PUBLISHED -> ARCHIVED.

Kept separate from status.py's generic StatusEngine (whose routine
advancement stops at PUBLISHED) because archiving is a distinct
editorial action an editor consciously triggers, not something that
happens as a matter of routine production progress.
"""
from typing import Optional

from .article import Article
from .history import HistoryEngine, now_iso
from .status import ArticleStatus, InvalidTransitionError


class ArchiveEngine:
    def __init__(self, history_engine: Optional[HistoryEngine] = None):
        self._history = history_engine or HistoryEngine()

    def archive(self, article: Article, note: Optional[str] = None) -> Article:
        if article.status != ArticleStatus.PUBLISHED:
            raise InvalidTransitionError(
                f"Chỉ có thể Archive một Article đã PUBLISHED (hiện tại: {article.status.value})."
            )
        article.status = ArticleStatus.ARCHIVED
        self._history.record(article.history, ArticleStatus.ARCHIVED, note=note)
        article.updated = now_iso()
        return article
