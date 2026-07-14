"""Phase 3 section 8: Dashboard Data."""
from editorial_intelligence.editorial.dashboard import DashboardEngine
from editorial_intelligence.models.enums import EditorialDecisionType, EventStatus, EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.story_candidate import StoryCandidate

_CONFIG = {"high_priority_threshold": 70}


def _story(decision=None, priority=0, event_status=EventStatus.PENDING_REVIEW):
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.status = event_status
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    story.priority_score = priority
    story.decision = decision
    return story


def test_empty_pool():
    stats = DashboardEngine(config=_CONFIG).compute([])
    assert stats.pending == 0
    assert stats.published == 0


def test_pending_counts_hold_and_need_more_sources():
    stories = [
        _story(decision=EditorialDecisionType.HOLD),
        _story(decision=EditorialDecisionType.NEED_MORE_SOURCES),
        _story(decision=EditorialDecisionType.PUBLISH),
    ]
    stats = DashboardEngine(config=_CONFIG).compute(stories)
    assert stats.pending == 2


def test_high_priority_counts_by_threshold():
    stories = [_story(priority=70), _story(priority=69)]
    stats = DashboardEngine(config=_CONFIG).compute(stories)
    assert stats.high_priority == 1


def test_low_confidence_counts_by_event_status():
    stories = [_story(event_status=EventStatus.LOW_CONFIDENCE), _story(event_status=EventStatus.PENDING_REVIEW)]
    stats = DashboardEngine(config=_CONFIG).compute(stories)
    assert stats.low_confidence == 1


def test_duplicate_published_rejected_counts():
    stories = [
        _story(decision=EditorialDecisionType.MERGE),
        _story(decision=EditorialDecisionType.PUBLISH),
        _story(decision=EditorialDecisionType.PUBLISH),
        _story(decision=EditorialDecisionType.REJECT),
    ]
    stats = DashboardEngine(config=_CONFIG).compute(stories)
    assert stats.duplicate == 1
    assert stats.published == 2
    assert stats.rejected == 1
