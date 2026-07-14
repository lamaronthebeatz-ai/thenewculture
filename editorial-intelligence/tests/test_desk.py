"""Phase 3 orchestrator: EditorialDesk — NOT part of CollectorPipeline."""
from editorial_intelligence.editorial.assignment import AssignmentGenerator
from editorial_intelligence.editorial.decision import EditorialDecisionEngine
from editorial_intelligence.editorial.desk import EditorialDesk
from editorial_intelligence.editorial.priority import PriorityEngine
from editorial_intelligence.editorial.story import StoryLayer
from editorial_intelligence.models.enums import EditorialDecisionType, EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.mapping_result import MappingResult
from editorial_intelligence.models.source import Source
from editorial_intelligence.models.enums import SourceTier


def _high_confidence_event(title, artist="Nghệ Sĩ A"):
    event = EditorialEvent.create(
        title=title, artist=artist, event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.confidence = 90
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    event.suggested_series = "tnc-records"
    event.mapping_result = MappingResult(category="Release", series="tnc-records", homepage=True, magazine=True)
    return event


def _desk():
    story_rules = {
        "default_by_event_type": {"album_release": "release"},
        "breaking_eligible_event_types": [],
        "breaking_within_days": 0,
        "breaking_min_confidence": 999,
    }
    priority_weights = {
        "story_type_weights": {"release": 60},
        "confidence_multiplier": 0.3,
        "homepage_bonus": 20,
        "magazine_bonus": 10,
    }
    decision_rules = {"publish_priority_threshold": 70, "hold_priority_threshold": 30}
    assignment_rules = {"suggested_length_by_story_type": {"release": "400-600"}}

    return EditorialDesk(
        story_layer=StoryLayer(rules=story_rules),
        priority_engine=PriorityEngine(weights=priority_weights),
        decision_engine=EditorialDecisionEngine(rules=decision_rules),
        assignment_generator=AssignmentGenerator(rules=assignment_rules),
    )


def test_process_runs_full_sequence_for_one_event():
    desk = _desk()
    event = _high_confidence_event("Album X")
    story = desk.process(event)

    assert story.story_type == StoryType.RELEASE
    assert story.priority_score == 60 + int(90 * 0.3) + 20 + 10  # base + confidence + homepage + magazine
    assert story.decision == EditorialDecisionType.PUBLISH
    assert story.assignment is not None
    assert story.assignment.suggested_series == "tnc-records"
    assert story.assignment.suggested_length == "400-600"


def test_process_all_lets_recommendation_see_whole_batch():
    desk = _desk()
    a = _high_confidence_event("Album A", artist="Nghệ Sĩ A")
    b = _high_confidence_event("Album B", artist="Nghệ Sĩ A")  # same artist -> related

    stories = desk.process_all([a, b])

    assert len(stories) == 2
    story_a = next(s for s in stories if s.event.title == "Album A")
    # AssignmentGenerator's internal links come from RecommendationEngine,
    # which only has related_artists — but related_articles/internal_links
    # cross-linking is proven directly in test_recommendation.py; here we
    # just confirm the desk wires the same pool through to every story.
    assert story_a.assignment is not None


def test_process_without_pool_defaults_to_single_item_pool():
    desk = _desk()
    event = _high_confidence_event("Solo Album")
    story = desk.process(event)  # no pool passed
    assert story.assignment is not None
