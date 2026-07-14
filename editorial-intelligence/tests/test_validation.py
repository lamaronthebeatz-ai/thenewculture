"""Section II: title/source/published_at/artist/event_type/url/duplicate-id."""
import pytest

from editorial_intelligence.events.validation import ValidationError, validate_event
from editorial_intelligence.models.enums import EventType, SourceTier
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source


def _valid_event(**overrides) -> EditorialEvent:
    defaults = dict(
        title="Album X ra mắt",
        artist="Nghệ Sĩ A",
        event_type=EventType.ALBUM_RELEASE,
        description="mô tả",
        published_at="2026-08-01",
    )
    defaults.update(overrides)
    event = EditorialEvent.create(**defaults)
    if "sources" not in overrides:
        event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://example.com"))
    return event


def test_valid_event_passes():
    validate_event(_valid_event())  # must not raise


def test_missing_title_raises():
    event = _valid_event(title="")
    with pytest.raises(ValidationError, match="title"):
        validate_event(event)


def test_missing_source_raises():
    event = EditorialEvent.create(
        title="Album X", artist="Nghệ Sĩ A", event_type=EventType.ALBUM_RELEASE,
        description="", published_at="2026-08-01",
    )
    assert event.sources == []
    with pytest.raises(ValidationError, match="source"):
        validate_event(event)


def test_missing_published_at_raises():
    event = _valid_event(published_at=None)
    with pytest.raises(ValidationError, match="published_at"):
        validate_event(event)


def test_missing_artist_raises():
    event = _valid_event(artist="   ")
    with pytest.raises(ValidationError, match="artist"):
        validate_event(event)


def test_invalid_event_type_raises():
    event = _valid_event()
    event.event_type = "not-a-real-type"  # bypass the enum on purpose, to test the isinstance check
    with pytest.raises(ValidationError, match="event_type"):
        validate_event(event)


def test_invalid_url_raises():
    event = _valid_event()
    event.sources = [Source(name="Official Website", tier=SourceTier.TIER_1, url="not a url")]
    with pytest.raises(ValidationError, match="url"):
        validate_event(event)


def test_valid_url_passes():
    event = _valid_event()
    event.sources = [Source(name="Official Website", tier=SourceTier.TIER_1, url="https://example.com/page")]
    validate_event(event)  # must not raise


def test_duplicate_id_raises():
    event = _valid_event()
    with pytest.raises(ValidationError, match="duplicate id"):
        validate_event(event, existing_ids={event.id})


def test_no_duplicate_id_when_not_seen():
    event = _valid_event()
    validate_event(event, existing_ids={"some-other-id"})  # must not raise
