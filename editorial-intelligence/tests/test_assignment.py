"""Phase 3 section 4: Assignment Generator."""
from editorial_intelligence.editorial.assignment import AssignmentGenerator
from editorial_intelligence.editorial.recommendation import RecommendationEngine
from editorial_intelligence.models.enums import EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.mapping_result import MappingResult
from editorial_intelligence.models.story_candidate import StoryCandidate

_RULES = {"suggested_length_by_story_type": {"breaking": "150-300", "release": "400-600"}}


def _story(story_type=StoryType.RELEASE, related_artists=None):
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.related_artists = related_artists or []
    event.mapping_result = MappingResult(
        category="Release", series="tnc-records", profiles=["a"], tags=["#TNC"],
    )
    return StoryCandidate(event=event, story_type=story_type)


def test_generate_pulls_series_category_tags_profiles_from_mapping_result():
    generator = AssignmentGenerator(rules=_RULES)
    story = _story()
    assignment = generator.generate(story)
    assert assignment.suggested_series == "tnc-records"
    assert assignment.suggested_category == "Release"
    assert assignment.suggested_tags == ["#TNC"]
    assert assignment.suggested_profiles == ["a"]


def test_generate_sets_length_by_story_type():
    generator = AssignmentGenerator(rules=_RULES)
    breaking_story = _story(StoryType.BREAKING)
    release_story = _story(StoryType.RELEASE)
    assert generator.generate(breaking_story).suggested_length == "150-300"
    assert generator.generate(release_story).suggested_length == "400-600"


def test_generate_delegates_internal_links_to_recommendation_engine():
    story = _story(related_artists=["Nghệ Sĩ D"])
    generator = AssignmentGenerator(rules=_RULES, recommendation_engine=RecommendationEngine())
    assignment = generator.generate(story)
    assert assignment.suggested_internal_links == ["Nghệ Sĩ D"]


def test_generate_stores_assignment_on_story():
    generator = AssignmentGenerator(rules=_RULES)
    story = _story()
    assignment = generator.generate(story)
    assert story.assignment is assignment


def test_generate_without_mapping_result_falls_back_to_event_fields():
    generator = AssignmentGenerator(rules=_RULES)
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.suggested_series = "tnc-tracks"
    event.suggested_tags = ["#TNC"]
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    assignment = generator.generate(story)
    assert assignment.suggested_series == "tnc-tracks"
    assert assignment.suggested_tags == ["#TNC"]
    assert assignment.suggested_profiles == []
