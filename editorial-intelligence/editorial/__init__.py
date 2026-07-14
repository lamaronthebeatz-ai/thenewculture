"""Editorial Intelligence layer (Phase 3) — operates on StoryCandidate,
built from already-processed EditorialEvents (Phase 1/2's Collector
pipeline output). See docs/editorial-intelligence.md for the full flow.
"""
from .assignment import AssignmentGenerator
from .cover_story import CoverStorySelector
from .dashboard import DashboardEngine
from .decision import EditorialDecisionEngine
from .desk import EditorialDesk
from .issue_planner import IssuePlanner
from .priority import PriorityEngine
from .recommendation import RecommendationEngine
from .story import StoryLayer

__all__ = [
    "AssignmentGenerator",
    "CoverStorySelector",
    "DashboardEngine",
    "EditorialDecisionEngine",
    "EditorialDesk",
    "IssuePlanner",
    "PriorityEngine",
    "RecommendationEngine",
    "StoryLayer",
]
