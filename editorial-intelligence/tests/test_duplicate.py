"""Section IV: artist + event_type mandatory, 2-of-{date,title,url,platform}."""
from editorial_intelligence.events.duplicate import DuplicateEngine
from editorial_intelligence.models.enums import EventStatus, EventType, SourceTier
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source


def _event(**overrides):
    defaults = dict(
        title="Album X ra mắt", artist="Nghệ Sĩ A", event_type=EventType.ALBUM_RELEASE,
        description="", published_at="2026-08-20", platform="spotify",
    )
    defaults.update(overrides)
    return EditorialEvent.create(**defaults)


def test_different_artist_never_duplicate():
    engine = DuplicateEngine()
    a = _event(artist="Nghệ Sĩ A")
    b = _event(artist="Nghệ Sĩ B")
    assert not engine.is_duplicate(a, b)


def test_different_event_type_never_duplicate():
    engine = DuplicateEngine()
    a = _event(event_type=EventType.ALBUM_RELEASE)
    b = _event(event_type=EventType.CONCERT)
    assert not engine.is_duplicate(a, b)


def test_only_one_secondary_match_is_not_duplicate():
    engine = DuplicateEngine()
    a = _event(title="Album X", published_at="2026-08-20", platform="spotify")
    a.sources = [Source(name="A", tier=SourceTier.TIER_1, url="https://a.example.com")]
    b = _event(title="Album Y hoàn toàn khác", published_at="1999-01-01", platform="apple music")
    b.sources = [Source(name="B", tier=SourceTier.TIER_1, url="https://b.example.com")]
    assert not engine.is_duplicate(a, b)


def test_date_and_title_match_is_duplicate():
    engine = DuplicateEngine()
    a = _event(title="Album X ra mắt", published_at="2026-08-20", platform="spotify")
    b = _event(title="Album X ra mắt", published_at="2026-08-20", platform="apple music")
    assert engine.is_duplicate(a, b)


def test_url_match_counts_as_a_secondary_signal():
    engine = DuplicateEngine()
    a = _event(title="Album X", published_at="2026-08-20", platform="spotify")
    a.sources = [Source(name="A", tier=SourceTier.TIER_1, url="https://shared.example.com/x")]
    b = _event(title="Hoàn toàn khác", published_at="1999-01-01", platform="apple music")
    b.sources = [Source(name="B", tier=SourceTier.TIER_1, url="https://shared.example.com/x")]
    # only URL + (nothing else) matches between the two -> still just 1... add platform too
    assert not engine.is_duplicate(a, b)
    b.platform = "spotify"
    assert engine.is_duplicate(a, b)  # url + platform = 2 secondary matches


def test_merge_combines_sources_and_related_fields():
    engine = DuplicateEngine()
    primary = _event()
    primary.sources = [Source(name="Spotify Releases", tier=SourceTier.TIER_3)]
    primary.related_artists = ["X"]
    duplicate = _event()
    duplicate.sources = [Source(name="Official Website", tier=SourceTier.TIER_1)]
    duplicate.related_artists = ["Y"]
    duplicate.related_profiles = ["profile-y"]

    merged = engine.merge(primary, duplicate)

    assert merged is primary
    assert merged.unique_source_names() == ["Spotify Releases", "Official Website"]
    assert merged.related_artists == ["X", "Y"]
    assert merged.related_profiles == ["profile-y"]
    assert duplicate.status == EventStatus.MERGED


def test_merge_selects_primary_source_by_best_tier():
    engine = DuplicateEngine()
    primary = _event()
    primary.sources = [Source(name="Spotify Releases", tier=SourceTier.TIER_3)]
    duplicate = _event()
    duplicate.sources = [Source(name="Official Website", tier=SourceTier.TIER_1)]

    merged = engine.merge(primary, duplicate)

    assert merged.primary_source is not None
    assert merged.primary_source.name == "Official Website"
    assert merged.primary_source.tier == SourceTier.TIER_1


def test_process_sets_primary_source_even_without_merge():
    engine = DuplicateEngine()
    event = _event()
    event.sources = [Source(name="YouTube Music", tier=SourceTier.UNKNOWN)]

    kept, was_merged = engine.process(event, existing=[])

    assert was_merged is False
    assert kept.primary_source is not None
    assert kept.primary_source.name == "YouTube Music"


def test_find_duplicate_skips_already_merged_events():
    engine = DuplicateEngine()
    a = _event()
    a.status = EventStatus.MERGED
    b = _event()
    assert engine.find_duplicate(b, existing=[a]) is None
