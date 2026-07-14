"""Section III: EventNormalizer — artist/title/date/url/platform/event_type."""
import pytest

from editorial_intelligence.events.normalizer import EventNormalizer, clean_text, dedupe_preserve_order
from editorial_intelligence.models.enums import EventType, SourceTier


def test_clean_text_collapses_whitespace_preserves_diacritics():
    assert clean_text("  Nghệ   Sĩ   A  ") == "Nghệ Sĩ A"


def test_dedupe_preserve_order():
    assert dedupe_preserve_order(["A", "b", "A", "", "C", "b"]) == ["A", "b", "C"]


def test_normalize_artist_and_title():
    assert EventNormalizer.artist("  Nghệ Sĩ A  ") == "Nghệ Sĩ A"
    assert EventNormalizer.title("  Album   X  ") == "Album X"


@pytest.mark.parametrize("raw,expected", [
    ("2026-08-20", "2026-08-20"),
    ("2026/08/20", "2026-08-20"),
    ("20-08-2026", "2026-08-20"),
    ("20/08/2026", "2026-08-20"),
    ("20.08.2026", "2026-08-20"),
    ("2026-08-20T10:00:00Z", "2026-08-20"),
])
def test_normalize_date_accepted_formats(raw, expected):
    assert EventNormalizer.date(raw) == expected


def test_normalize_date_unparseable_returns_none():
    assert EventNormalizer.date("not a date") is None


def test_normalize_date_empty_returns_none():
    assert EventNormalizer.date(None) is None
    assert EventNormalizer.date("") is None


def test_normalize_url():
    assert EventNormalizer.url("  https://example.com/x  ") == "https://example.com/x"
    assert EventNormalizer.url(None) is None
    assert EventNormalizer.url("") is None


def test_normalize_platform_lowercases():
    assert EventNormalizer.platform("Spotify") == "spotify"
    assert EventNormalizer.platform("  YouTube Music ") == "youtube music"
    assert EventNormalizer.platform(None) is None


@pytest.mark.parametrize("raw,expected", [
    ("Album Release", EventType.ALBUM_RELEASE),
    ("album", EventType.ALBUM_RELEASE),
    ("SINGLE", EventType.SINGLE_RELEASE),
    ("mv", EventType.MV_RELEASE),
    ("music video", EventType.MV_RELEASE),
    ("FESTIVAL", EventType.FESTIVAL),
    ("show", EventType.CONCERT),
    ("interview", EventType.INTERVIEW),
    ("awards", EventType.AWARD),
    ("community", EventType.COMMUNITY_EVENT),
    (EventType.CONCERT, EventType.CONCERT),
])
def test_normalize_event_type_aliases(raw, expected):
    assert EventNormalizer.event_type(raw) == expected


def test_normalize_event_type_unrecognized_raises():
    with pytest.raises(ValueError, match="event_type"):
        EventNormalizer.event_type("not a real type")


@pytest.mark.parametrize("raw,expected", [
    ("official", SourceTier.TIER_1),
    ("Official", SourceTier.TIER_1),
    ("editorial", SourceTier.TIER_2),
    ("community", SourceTier.TIER_3),
    ("unknown", SourceTier.UNKNOWN),
    ("something-else", SourceTier.UNKNOWN),
    (None, SourceTier.UNKNOWN),
    (SourceTier.TIER_2, SourceTier.TIER_2),
])
def test_normalize_source_tier(raw, expected):
    assert EventNormalizer.source_tier(raw) == expected
