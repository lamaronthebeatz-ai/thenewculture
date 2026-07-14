"""StoryCandidate — the central unit of Phase 3 (Editorial Intelligence
layer), the way EditorialEvent is the central unit of Phase 1/2.

A StoryCandidate WRAPS an EditorialEvent rather than adding more fields
onto it — this is deliberate: Phase 1/2's EditorialEvent stays exactly as
it was (zero new fields, zero changed behavior), and every Phase 3
engine (editorial/story.py, priority.py, decision.py, ...) reads/writes
StoryCandidate fields instead. Nothing about the Collector pipeline
(collector/pipeline.py) changes to support this — StoryCandidates are
built from events *after* they leave the EventQueue, by
editorial/desk.py, a separate orchestrator (see docs/editorial-
intelligence.md, "Phase 3 flow").
"""
from dataclasses import dataclass, field
from typing import List, Optional

from .enums import EditorialDecisionType, StoryType
from .event import EditorialEvent


@dataclass
class EditorialAssignment:
    """Section 4 (Assignment Generator) output."""

    suggested_series: Optional[str] = None
    suggested_category: Optional[str] = None
    suggested_tags: List[str] = field(default_factory=list)
    suggested_profiles: List[str] = field(default_factory=list)
    suggested_internal_links: List[str] = field(default_factory=list)
    suggested_length: Optional[str] = None


@dataclass
class StoryCandidate:
    event: EditorialEvent
    story_type: StoryType

    priority_score: int = 0
    decision: Optional[EditorialDecisionType] = None
    decision_reason: str = ""
    assignment: Optional[EditorialAssignment] = None
    editorial_notes: List[str] = field(default_factory=list)

    @property
    def id(self) -> str:
        return self.event.id
