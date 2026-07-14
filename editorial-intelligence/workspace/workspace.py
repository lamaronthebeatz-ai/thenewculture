"""Workspace (Phase 5 orchestrator) — the single place that owns the
in-memory list of Articles and drives them through ArticleStatus's fixed
lifecycle (status.py), delegating every rule to StatusEngine/
HistoryEngine. Same orchestrator-only role EditorialDesk
(editorial/desk.py, Phase 3) plays for StoryCandidates — Workspace never
computes Priority/Decision/Assignment itself, Article.story (a
StoryCandidate) already carries all of that from Phase 3, untouched.

Storage is "Memory + JSON, không Database" per the spec: this class only
holds Articles in memory; the actual JSON read/write lives in the CLI
(scripts/editorial.py), the same split Phase 4 used for StoryCandidates.
"""
from typing import List, Optional

from ..models.story_candidate import StoryCandidate
from .article import Article
from .history import HistoryEngine, now_iso
from .status import ArticleStatus, InvalidTransitionError, StatusEngine


class Workspace:
    def __init__(
        self,
        articles: Optional[List[Article]] = None,
        status_engine: Optional[StatusEngine] = None,
        history_engine: Optional[HistoryEngine] = None,
    ):
        self._status = status_engine or StatusEngine()
        self._history = history_engine or HistoryEngine()
        self._articles: List[Article] = list(articles) if articles is not None else []

    def all_articles(self) -> List[Article]:
        return list(self._articles)

    def find(self, article_id: str) -> Optional[Article]:
        for a in self._articles:
            if a.id == article_id:
                return a
        matches = [a for a in self._articles if a.id.startswith(article_id)]
        return matches[0] if len(matches) == 1 else None

    def create_article(self, story: StoryCandidate, assigned_editor: Optional[str] = None) -> Article:
        """Idempotent: returns the existing Article if `story.event.id`
        is already tracked, instead of creating a duplicate — this is
        what lets the CLI safely re-sync from stories.json on every
        invocation without ever losing an Article's history/status."""
        existing = self.find(story.event.id)
        if existing is not None:
            return existing

        timestamp = now_iso()
        article = Article(story=story, assigned_editor=assigned_editor, created=timestamp, updated=timestamp)
        self._history.record(article.history, ArticleStatus.NEW)
        self._articles.append(article)
        return article

    def advance(self, article: Article, note: Optional[str] = None) -> Article:
        """Moves `article` one step forward per STATUS_ORDER. Stops at
        PUBLISHED — PUBLISHED -> ARCHIVED is archive.py's ArchiveEngine,
        a deliberate separate action, not part of routine advancement."""
        target = self._status.next_status(article.status)
        if target is None or target == ArticleStatus.ARCHIVED:
            raise InvalidTransitionError(
                "Đã đến bước cuối của quy trình sản xuất — dùng `editorial archive` để lưu trữ."
            )
        self._status.validate_transition(article.status, target)
        article.status = target
        self._history.record(article.history, target, note=note)
        article.updated = now_iso()
        if target == ArticleStatus.PUBLISHED:
            article.published = article.updated
        return article

    def set_prompt_path(self, article: Article, path: str) -> None:
        article.prompt_path = path
        article.updated = now_iso()

    def set_markdown_path(self, article: Article, path: str) -> None:
        article.markdown_path = path
        article.updated = now_iso()

    def assign_editor(self, article: Article, editor: str) -> None:
        article.assigned_editor = editor
        article.updated = now_iso()
