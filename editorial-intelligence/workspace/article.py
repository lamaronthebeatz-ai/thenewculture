"""Article — the Workspace's own central unit (Phase 5), WRAPPING a
StoryCandidate exactly the way StoryCandidate itself wraps an
EditorialEvent (Phase 3's pattern, see models/story_candidate.py) — zero
lines of Phase 1-3 change to support this. Title/Series/Story Type/
Priority are read straight through from the wrapped StoryCandidate/
EditorialEvent rather than copied, so they can never drift out of sync.
"""
from dataclasses import dataclass, field
from typing import List, Optional

from ..models.enums import StoryType
from ..models.story_candidate import StoryCandidate
from .history import HistoryEntry
from .status import ArticleStatus


@dataclass
class Article:
    story: StoryCandidate

    status: ArticleStatus = ArticleStatus.NEW
    assigned_editor: Optional[str] = None
    prompt_path: Optional[str] = None
    markdown_path: Optional[str] = None

    created: str = ""
    updated: str = ""
    published: Optional[str] = None

    history: List[HistoryEntry] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.story.event.id

    @property
    def title(self) -> str:
        return self.story.event.title

    @property
    def series(self) -> Optional[str]:
        return self.story.event.suggested_series

    @property
    def story_type(self) -> StoryType:
        return self.story.story_type

    @property
    def priority(self) -> int:
        return self.story.priority_score
