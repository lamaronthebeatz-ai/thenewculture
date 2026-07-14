"""Section VI: category/series/profiles/tags/homepage/magazine/
related_profiles/related_series/search_weight — rule-based, YAML-driven."""
from editorial_intelligence.events.mapping import EditorialMappingEngine
from editorial_intelligence.models.enums import EventType
from editorial_intelligence.models.event import EditorialEvent

_MAPPING = {"album_release": "tnc-records", "festival": "tnc-radar"}
_CATEGORIES = {
    "categories": {"album_release": "Release", "festival": "Live Event"},
    "related_series": {"album_release": ["tnc-reviews"], "festival": ["tnc-community"]},
    "homepage_eligible_event_types": ["album_release"],
    "homepage_confidence_threshold": 70,
    "magazine_eligible_event_types": ["album_release", "festival"],
    "magazine_confidence_threshold": 50,
    "search_weight_base": 10,
    "search_weight_confidence_multiplier": 0.5,
}


def _engine():
    return EditorialMappingEngine(mapping=_MAPPING, categories=_CATEGORIES)


def _event(event_type=EventType.ALBUM_RELEASE, confidence=80, artist="Nghệ Sĩ A"):
    event = EditorialEvent.create(
        title="t", artist=artist, event_type=event_type, description="", published_at="2026-08-01",
    )
    event.confidence = confidence
    return event


def test_apply_full_reuses_apply_for_series_and_tags():
    event = _event()
    result = _engine().apply_full(event)
    assert event.suggested_series == "tnc-records"  # Phase 1 field, unchanged behavior
    assert result.series == event.suggested_series
    assert result.tags == event.suggested_tags


def test_category_from_config():
    result = _engine().apply_full(_event(event_type=EventType.ALBUM_RELEASE))
    assert result.category == "Release"
    result2 = _engine().apply_full(_event(event_type=EventType.FESTIVAL, artist="Various"))
    assert result2.category == "Live Event"


def test_related_series_from_config():
    result = _engine().apply_full(_event(event_type=EventType.ALBUM_RELEASE))
    assert result.related_series == ["tnc-reviews"]


def test_homepage_true_only_when_eligible_type_and_confidence_met():
    high = _engine().apply_full(_event(event_type=EventType.ALBUM_RELEASE, confidence=80))
    assert high.homepage is True

    low_confidence = _engine().apply_full(_event(event_type=EventType.ALBUM_RELEASE, confidence=60))
    assert low_confidence.homepage is False

    wrong_type = _engine().apply_full(_event(event_type=EventType.FESTIVAL, confidence=90, artist="Various"))
    assert wrong_type.homepage is False  # festival not in homepage_eligible_event_types


def test_magazine_true_for_both_configured_types():
    album = _engine().apply_full(_event(event_type=EventType.ALBUM_RELEASE, confidence=60))
    festival = _engine().apply_full(_event(event_type=EventType.FESTIVAL, confidence=60, artist="Various"))
    assert album.magazine is True
    assert festival.magazine is True


def test_search_weight_formula():
    result = _engine().apply_full(_event(confidence=80))
    # base(10) + confidence(80) * multiplier(0.5) = 10 + 40 = 50
    assert result.search_weight == 50


def test_profiles_includes_primary_artist_slug_and_related_profiles():
    event = _event(artist="Nghệ Sĩ A")
    event.related_profiles = ["some-other-profile"]
    result = _engine().apply_full(event)
    assert "nghe-si-a" in result.profiles
    assert "some-other-profile" in result.profiles
    assert result.related_profiles == ["some-other-profile"]


def test_mapping_result_stored_on_event():
    event = _event()
    result = _engine().apply_full(event)
    assert event.mapping_result is result
