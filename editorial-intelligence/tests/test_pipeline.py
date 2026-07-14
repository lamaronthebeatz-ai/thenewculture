"""End-to-end smoke test for the whole wiring: Provider -> Duplicate
Engine -> Confidence Engine -> Editorial Mapping -> Queue -> Prompt
Generator. Uses only FakeProvider (tests/fakes.py) and in-memory
components — no I/O, no network, no real Source.

Run with: `pytest editorial-intelligence/tests` from the repo root.
"""
from editorial_intelligence.collector.pipeline import CollectorPipeline
from editorial_intelligence.models.enums import EventStatus, EventType, SourceTier
from editorial_intelligence.prompt.generator import LowConfidenceError, PromptGenerator
from editorial_intelligence.providers.registry import ProviderRegistry
from editorial_intelligence.queue.in_memory import InMemoryEventQueue

from fakes import FakeProvider


def _build_registry(*providers):
    registry = ProviderRegistry()
    for p in providers:
        registry.register(p)
    return registry


def test_high_confidence_event_reaches_pending_review():
    provider = FakeProvider("Official Website", [{
        "title": "Album X ra mắt",
        "artist": "Nghệ Sĩ A",
        "event_type": EventType.ALBUM_RELEASE,
        "description": "Album phòng thu thứ hai.",
        "published_at": "2026-08-01",
        "platform": "spotify",
        "sources": ["Official Website"],
        "tier": SourceTier.TIER_1.value,
    }])
    queue = InMemoryEventQueue()
    pipeline = CollectorPipeline(_build_registry(provider), queue)

    newly_added = pipeline.run()

    assert len(newly_added) == 1
    event = newly_added[0]
    assert event.status == EventStatus.PENDING_REVIEW
    assert event.confidence >= 50
    assert event.suggested_series == "tnc-records"
    assert "#TNC" in event.suggested_tags
    assert queue.get(event.id) is event


def test_low_confidence_event_is_held_back_and_prompt_refused():
    provider = FakeProvider("YouTube Music", [{
        "title": "Bài hát mới",
        "artist": "Nghệ Sĩ B",
        "event_type": EventType.SINGLE_RELEASE,
        "description": "Phát hành trên YouTube Music.",
        "sources": ["YouTube Music"],
        "tier": SourceTier.TIER_3.value,
    }])
    queue = InMemoryEventQueue()
    pipeline = CollectorPipeline(_build_registry(provider), queue)

    newly_added = pipeline.run()

    assert len(newly_added) == 1
    event = newly_added[0]
    assert event.status == EventStatus.LOW_CONFIDENCE

    generator = PromptGenerator()
    try:
        generator.generate(event)
        assert False, "expected LowConfidenceError"
    except LowConfidenceError:
        pass


def test_duplicate_events_from_two_providers_merge_into_one():
    shared_fields = {
        "title": "Festival Y công bố line-up",
        "artist": "Various Artists",
        "event_type": EventType.FESTIVAL,
        "published_at": "2026-09-15",
        "platform": "facebook",
    }
    provider_a = FakeProvider("Festival Organizers", [{
        **shared_fields, "description": "Thông báo từ ban tổ chức.",
        "sources": ["Festival Organizers"], "tier": SourceTier.TIER_2.value,
    }])
    provider_b = FakeProvider("Facebook Verified", [{
        **shared_fields, "description": "Đăng lại trên trang Facebook xác thực.",
        "sources": ["Facebook Verified"], "tier": SourceTier.TIER_1.value,
    }])
    queue = InMemoryEventQueue()
    pipeline = CollectorPipeline(_build_registry(provider_a, provider_b), queue)

    newly_added = pipeline.run()

    assert len(newly_added) == 1, "second provider's event should merge, not add a new queue entry"
    merged_event = newly_added[0]
    assert merged_event.unique_source_names() == ["Festival Organizers", "Facebook Verified"]
    assert merged_event.suggested_series == "tnc-radar"


def test_prompt_contains_every_required_section():
    provider = FakeProvider("Official Website", [{
        "title": "Concert Z sắp diễn ra",
        "artist": "Nghệ Sĩ C",
        "event_type": EventType.CONCERT,
        "description": "Concert lớn cuối năm.",
        "published_at": "2026-12-01",
        "related_artists": ["Nghệ Sĩ D"],
        "related_profiles": ["nghe-si-c"],
        "sources": ["Official Website"],
        "tier": SourceTier.TIER_1.value,
    }])
    queue = InMemoryEventQueue()
    pipeline = CollectorPipeline(_build_registry(provider), queue)
    event = pipeline.run()[0]

    prompt = PromptGenerator().generate(event)

    for heading in [
        "## Editorial Guideline", "## Event", "## Sources", "## Metadata",
        "## SEO Requirement", "## Frontmatter", "## Suggested Series",
        "## Suggested Tags", "## Internal Linking Suggestions", "## Related Profiles",
    ]:
        assert heading in prompt.text, f"missing section: {heading}"

    assert event.status == EventStatus.PROMPTED
    assert prompt.frontmatter["title"] == "Concert Z sắp diễn ra"
    assert prompt.frontmatter["series"] == "tnc-radar"
