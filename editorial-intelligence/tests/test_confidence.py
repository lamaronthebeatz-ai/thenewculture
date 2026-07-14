"""Section V/VII: confidence scoring, entirely YAML-driven (no hardcode).
Uses an explicit weights table injected via the constructor (dependency
injection) rather than the real config/confidence_weights.yaml, so these
tests don't silently break if that file's numbers are ever tuned."""
from editorial_intelligence.events.confidence import ConfidenceEngine
from editorial_intelligence.models.enums import EventStatus, EventType, SourceTier
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source

_WEIGHTS = {
    "source_weights": {"Official Website": 50},
    "default_tier_weights": {"tier_1": 10, "tier_2": 7, "tier_3": 4, "unknown": 2},
    "duplicate_source_bonus": 5,
    "prompt_eligibility_threshold": 50,
}
_TIER_LOOKUP = {"Official Website": "tier_1"}


def _engine():
    return ConfidenceEngine(weights=_WEIGHTS, tier_lookup=_TIER_LOOKUP)


def _event():
    return EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )


def test_no_sources_scores_zero():
    assert _engine().score(_event()) == 0


def test_named_source_weight_used_over_tier_default():
    event = _event()
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    assert _engine().score(event) == 50


def test_unnamed_source_falls_back_to_tier_default():
    event = _event()
    event.add_source(Source(name="Some Random Blog", tier=SourceTier.TIER_3))
    assert _engine().score(event) == 4


def test_unknown_tier_uses_its_own_low_weight():
    event = _event()
    event.add_source(Source(name="Some Random Blog", tier=SourceTier.UNKNOWN))
    assert _engine().score(event) == 2


def test_duplicate_source_occurrence_adds_bonus_once_per_repeat():
    event = _event()
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://a"))
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://a"))
    # base 50 (counted once for the name) + 1 repeat * bonus 5 = 55
    assert _engine().score(event) == 55


def test_apply_sets_pending_review_when_above_threshold():
    event = _event()
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    _engine().apply(event)
    assert event.confidence == 50
    assert event.status == EventStatus.PENDING_REVIEW


def test_apply_sets_low_confidence_when_below_threshold():
    event = _event()
    event.add_source(Source(name="Some Random Blog", tier=SourceTier.UNKNOWN))
    _engine().apply(event)
    assert event.confidence == 2
    assert event.status == EventStatus.LOW_CONFIDENCE


def test_is_prompt_eligible():
    engine = _engine()
    high = _event()
    high.confidence = 50
    low = _event()
    low.confidence = 49
    assert engine.is_prompt_eligible(high)
    assert not engine.is_prompt_eligible(low)
