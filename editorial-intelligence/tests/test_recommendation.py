"""Phase 3 section 7: Recommendation Engine."""
from editorial_intelligence.editorial.recommendation import RecommendationEngine
from editorial_intelligence.models.enums import EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.mapping_result import MappingResult
from editorial_intelligence.models.story_candidate import StoryCandidate


def _story(title, artist="Nghệ Sĩ A", series="tnc-records", related_artists=None):
    event = EditorialEvent.create(
        title=title, artist=artist, event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.suggested_series = series
    event.related_artists = related_artists or []
    event.mapping_result = MappingResult(
        category="Release", series=series,
        related_profiles=["profile-x"], related_series=["tnc-reviews"],
    )
    return StoryCandidate(event=event, story_type=StoryType.RELEASE)


def test_related_profiles_and_series_come_from_mapping_result():
    engine = RecommendationEngine()
    story = _story("A")
    recs = engine.recommend(story, pool=[])
    assert recs.related_profiles == ["profile-x"]
    assert recs.related_series == ["tnc-reviews"]


def test_internal_links_come_from_event_related_artists():
    engine = RecommendationEngine()
    story = _story("A", related_artists=["Nghệ Sĩ D"])
    recs = engine.recommend(story, pool=[])
    assert recs.internal_links == ["Nghệ Sĩ D"]


def test_related_articles_from_same_artist_in_pool():
    engine = RecommendationEngine()
    a = _story("Album A", artist="Nghệ Sĩ A", series="tnc-records")
    b = _story("Album B", artist="Nghệ Sĩ A", series="tnc-tracks")
    recs = engine.recommend(a, pool=[a, b])
    assert recs.related_articles == ["Album B"]


def test_related_articles_from_same_series_in_pool():
    engine = RecommendationEngine()
    a = _story("Album A", artist="X", series="tnc-records")
    b = _story("Album B", artist="Y", series="tnc-records")
    recs = engine.recommend(a, pool=[a, b])
    assert recs.related_articles == ["Album B"]


def test_story_excluded_from_its_own_recommendations():
    engine = RecommendationEngine()
    a = _story("Album A")
    recs = engine.recommend(a, pool=[a])
    assert recs.related_articles == []


def test_no_mapping_result_returns_empty_related_profiles_series():
    engine = RecommendationEngine()
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    recs = engine.recommend(story)
    assert recs.related_profiles == []
    assert recs.related_series == []
