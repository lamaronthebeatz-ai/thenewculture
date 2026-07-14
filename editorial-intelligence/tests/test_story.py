"""Phase 3 section 1: Story Layer."""
import datetime

from editorial_intelligence.editorial.story import StoryLayer
from editorial_intelligence.models.enums import EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent

_RULES = {
    "default_by_event_type": {
        "album_release": "release",
        "festival": "community",
        "interview": "interview",
    },
    "breaking_eligible_event_types": ["album_release"],
    "breaking_within_days": 2,
    "breaking_min_confidence": 70,
}


def _event(event_type=EventType.ALBUM_RELEASE, confidence=0, published_at="2026-08-20"):
    event = EditorialEvent.create(
        title="t", artist="a", event_type=event_type, description="", published_at=published_at,
    )
    event.confidence = confidence
    return event


def test_default_mapping_by_event_type():
    layer = StoryLayer(rules=_RULES)
    assert layer.classify(_event(EventType.FESTIVAL)) == StoryType.COMMUNITY
    assert layer.classify(_event(EventType.INTERVIEW)) == StoryType.INTERVIEW


def test_unmapped_event_type_falls_back_to_editorial():
    layer = StoryLayer(rules={"default_by_event_type": {}})
    assert layer.classify(_event(EventType.AWARD)) == StoryType.EDITORIAL


def test_override_wins_over_everything():
    layer = StoryLayer(rules=_RULES)
    result = layer.classify(_event(EventType.FESTIVAL), override=StoryType.FEATURE)
    assert result == StoryType.FEATURE


def test_breaking_when_recent_high_confidence_eligible_type():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.ALBUM_RELEASE, confidence=80, published_at="2026-08-19")
    reference = datetime.date(2026, 8, 20)  # 1 day after published_at
    assert layer.classify(event, reference_date=reference) == StoryType.BREAKING


def test_not_breaking_when_too_old():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.ALBUM_RELEASE, confidence=80, published_at="2026-08-01")
    reference = datetime.date(2026, 8, 20)  # way more than 2 days
    assert layer.classify(event, reference_date=reference) == StoryType.RELEASE


def test_not_breaking_when_confidence_too_low():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.ALBUM_RELEASE, confidence=10, published_at="2026-08-19")
    reference = datetime.date(2026, 8, 20)
    assert layer.classify(event, reference_date=reference) == StoryType.RELEASE


def test_not_breaking_when_event_type_not_eligible():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.FESTIVAL, confidence=90, published_at="2026-08-19")
    reference = datetime.date(2026, 8, 20)
    assert layer.classify(event, reference_date=reference) == StoryType.COMMUNITY


def test_not_breaking_when_no_published_at():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.ALBUM_RELEASE, confidence=90, published_at=None)
    assert layer.classify(event, reference_date=datetime.date(2026, 8, 20)) == StoryType.RELEASE


def test_build_returns_story_candidate_wrapping_event():
    layer = StoryLayer(rules=_RULES)
    event = _event(EventType.INTERVIEW)
    story = layer.build(event)
    assert story.event is event
    assert story.story_type == StoryType.INTERVIEW
    assert story.id == event.id
