"""Article Status (Phase 5) — the state machine an Article moves through
from creation to archive.

A separate, closed vocabulary from Phase 1's EventStatus and Phase 3's
EditorialDecisionType (models/enums.py, untouched) — those describe an
EditorialEvent/StoryCandidate's own lifecycle inside Phase 1-3.
ArticleStatus describes the Workspace's own production lifecycle,
layered on top, the same "wrap, don't modify" pattern StoryCandidate
itself used for EditorialEvent in Phase 3.
"""
from enum import Enum
from typing import Dict, List, Optional


class ArticleStatus(str, Enum):
    NEW = "new"
    PENDING_REVIEW = "pending_review"
    PROMPT_READY = "prompt_ready"
    WRITING = "writing"
    DRAFT_READY = "draft_ready"
    EDITOR_REVIEW = "editor_review"
    READY_TO_PUBLISH = "ready_to_publish"
    PUBLISHED = "published"
    ARCHIVED = "archived"


# The fixed lifecycle order exactly as specified — structural, not an
# editorial policy, so (like EventStatus/EditorialDecisionType in Phase
# 1/3) this is a closed, hardcoded sequence rather than a YAML config.
STATUS_ORDER: List[ArticleStatus] = [
    ArticleStatus.NEW,
    ArticleStatus.PENDING_REVIEW,
    ArticleStatus.PROMPT_READY,
    ArticleStatus.WRITING,
    ArticleStatus.DRAFT_READY,
    ArticleStatus.EDITOR_REVIEW,
    ArticleStatus.READY_TO_PUBLISH,
    ArticleStatus.PUBLISHED,
    ArticleStatus.ARCHIVED,
]

# One History Engine label per transition *into* the status at the same
# key — labels for Created/Prompt Generated/Writing Started/Draft
# Generated/Reviewed/Published/Archived match the spec's example
# verbatim; PENDING_REVIEW and EDITOR_REVIEW weren't named in that
# example so were named consistently with the others.
TRANSITION_LABELS: Dict[ArticleStatus, str] = {
    ArticleStatus.NEW: "Created",
    ArticleStatus.PENDING_REVIEW: "Queued for Review",
    ArticleStatus.PROMPT_READY: "Prompt Generated",
    ArticleStatus.WRITING: "Writing Started",
    ArticleStatus.DRAFT_READY: "Draft Generated",
    ArticleStatus.EDITOR_REVIEW: "Sent to Editor Review",
    ArticleStatus.READY_TO_PUBLISH: "Reviewed",
    ArticleStatus.PUBLISHED: "Published",
    ArticleStatus.ARCHIVED: "Archived",
}


class InvalidTransitionError(Exception):
    """Raised when asked to move an Article to a status that is not the
    very next step in STATUS_ORDER (or to jump backward/skip ahead)."""


class StatusEngine:
    """Rule-based, sequence-only state machine. No branching logic, no
    conditions on StoryCandidate fields — Phase 5 is production-workflow
    bookkeeping, not another editorial-judgment engine, so the only rule
    is "one step forward at a time"."""

    def next_status(self, current: ArticleStatus) -> Optional[ArticleStatus]:
        idx = STATUS_ORDER.index(current)
        if idx + 1 >= len(STATUS_ORDER):
            return None
        return STATUS_ORDER[idx + 1]

    def can_advance(self, current: ArticleStatus) -> bool:
        return self.next_status(current) is not None

    def validate_transition(self, current: ArticleStatus, target: ArticleStatus) -> None:
        expected = self.next_status(current)
        if target != expected:
            expected_label = expected.value if expected else "(none — already ARCHIVED)"
            raise InvalidTransitionError(
                f"Cannot move from {current.value} to {target.value}; "
                f"next valid status is {expected_label}."
            )
