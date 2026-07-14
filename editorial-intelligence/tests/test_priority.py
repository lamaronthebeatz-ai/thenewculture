"""Phase 3 section 2: Priority Engine — separate from Confidence Score."""
from editorial_intelligence.editorial.priority import PriorityEngine
from editorial_intelligence.models.enums import EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.mapping_result import MappingResult
from editorial_intelligence.models.story_candidate import StoryCandidate

_WEIGHTS = {
    "story_type_weights": {"breaking": 100, "community": 25},
    "confidence_multiplier": 0.3,
    "homepage_bonus": 20,
    "magazine_bonus": 10,
}


def _story(story_type=StoryType.BREAKING, confidence=0, homepage=False, magazine=False):
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.confidence = confidence
    event.mapping_result = MappingResult(category="Release", series="tnc-records", homepage=homepage, magazine=magazine)
    return StoryCandidate(event=event, story_type=story_type)


def test_score_uses_story_type_base_weight():
    engine = PriorityEngine(weights=_WEIGHTS)
    assert engine.score(_story(StoryType.BREAKING)) == 100
    assert engine.score(_story(StoryType.COMMUNITY)) == 25


def test_score_adds_confidence_multiplier():
    engine = PriorityEngine(weights=_WEIGHTS)
    story = _story(StoryType.COMMUNITY, confidence=50)
    assert engine.score(story) == 25 + int(50 * 0.3)


def test_score_adds_homepage_and_magazine_bonus():
    engine = PriorityEngine(weights=_WEIGHTS)
    story = _story(StoryType.COMMUNITY, homepage=True, magazine=True)
    assert engine.score(story) == 25 + 20 + 10


def test_score_without_mapping_result_skips_bonuses():
    engine = PriorityEngine(weights=_WEIGHTS)
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    story = StoryCandidate(event=event, story_type=StoryType.COMMUNITY)
    assert engine.score(story) == 25


def test_apply_sets_priority_score_on_story():
    engine = PriorityEngine(weights=_WEIGHTS)
    story = _story(StoryType.BREAKING)
    engine.apply(story)
    assert story.priority_score == 100


def test_unmapped_story_type_scores_zero_base():
    engine = PriorityEngine(weights={"story_type_weights": {}})
    story = _story(StoryType.FEATURE)
    assert engine.score(story) == 0
