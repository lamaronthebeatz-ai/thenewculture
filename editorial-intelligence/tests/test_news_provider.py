"""Section I: NewsProvider reads local JSON fixtures — no crawl, no
network, no fetch of any real source."""
import os

import pytest

from editorial_intelligence.models.enums import EventStatus, EventType, SourceTier
from editorial_intelligence.providers.news_provider import NewsProvider

_FIXTURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "news")


def _provider():
    return NewsProvider(_FIXTURES_DIR)


def test_fetch_reads_all_three_fixture_files_in_order():
    payloads = _provider().fetch()
    assert len(payloads) == 3
    assert payloads[0]["title"].strip().startswith("Album")
    assert payloads[1]["event_type"] == "single"
    assert payloads[2]["event_type"] == "FESTIVAL"


def test_fetch_performs_no_network_or_crawling(monkeypatch):
    """Guards against a regression where fetch() starts doing I/O beyond
    reading local files — patch out network primitives entirely and
    confirm fetch() still works."""
    import socket

    def _blow_up(*args, **kwargs):
        raise AssertionError("NewsProvider.fetch() must not touch the network")

    monkeypatch.setattr(socket, "socket", _blow_up)
    payloads = _provider().fetch()
    assert len(payloads) == 3


def test_normalize_cleans_whitespace_and_parses_date():
    provider = _provider()
    raw = provider.fetch()[0]  # event_01.json
    event = provider.normalize(raw)

    assert event.title == "Album Vọng Âm Ra Mắt"  # whitespace collapsed
    assert event.artist == "Nghệ Sĩ A"
    assert event.event_type == EventType.ALBUM_RELEASE
    assert event.published_at == "2026-08-20"  # "20/08/2026" -> ISO
    assert event.platform == "spotify"
    assert len(event.sources) == 2
    assert event.sources[0].tier == SourceTier.TIER_1


def test_normalize_uppercase_event_type_and_dotted_date():
    provider = _provider()
    raw = provider.fetch()[2]  # event_03.json: "FESTIVAL", "20.09.2026"
    event = provider.normalize(raw)

    assert event.event_type == EventType.FESTIVAL
    assert event.published_at == "2026-09-20"
    assert event.sources[0].tier == SourceTier.TIER_2  # "editorial"


def test_collect_returns_only_editorial_events_all_valid():
    provider = _provider()
    events = provider.collect()
    assert len(events) == 3
    for event in events:
        assert event.status == EventStatus.DISCOVERED  # not yet scored — that's the pipeline's job
        assert event.sources


def test_validate_rejects_event_missing_required_fields():
    provider = _provider()
    bad_event = provider.normalize({
        "title": "", "artist": "a", "event_type": "album", "published_at": "2026-01-01", "sources": [],
    })
    assert provider.validate(bad_event) is False


def test_validate_catches_duplicate_id_within_same_fetch_batch():
    provider = _provider()
    raw = provider.fetch()[0]
    event_a = provider.normalize(raw)
    event_b = provider.normalize(raw)  # identical raw -> identical id

    assert provider.validate(event_a) is True
    assert provider.validate(event_b) is False  # same id already seen this batch
