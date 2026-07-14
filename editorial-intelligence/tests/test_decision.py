"""Phase 3 section 3: Editorial Decision — status facts win over priority."""
from editorial_intelligence.editorial.decision import EditorialDecisionEngine
from editorial_intelligence.models.enums import EditorialDecisionType, EventStatus, EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.story_candidate import StoryCandidate

_RULES = {"publish_priority_threshold": 70, "hold_priority_threshold": 30}


def _story(status=EventStatus.PENDING_REVIEW, priority=0):
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.status = status
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    story.priority_score = priority
    return story


def test_rejected_status_always_wins():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(status=EventStatus.REJECTED, priority=100)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.REJECT


def test_merged_status_always_wins():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(status=EventStatus.MERGED, priority=100)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.MERGE


def test_low_confidence_status_means_need_more_sources():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(status=EventStatus.LOW_CONFIDENCE, priority=100)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.NEED_MORE_SOURCES


def test_high_priority_publishes():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(priority=70)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.PUBLISH


def test_mid_priority_holds():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(priority=30)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.HOLD


def test_low_priority_needs_more_sources():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(priority=10)
    engine.decide(story)
    assert story.decision == EditorialDecisionType.NEED_MORE_SOURCES


def test_decision_reason_is_populated():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(priority=70)
    engine.decide(story)
    assert story.decision_reason  # non-empty


def test_decide_returns_same_story_instance():
    engine = EditorialDecisionEngine(rules=_RULES)
    story = _story(priority=70)
    assert engine.decide(story) is story
