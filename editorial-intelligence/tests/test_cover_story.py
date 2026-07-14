"""Phase 3 section 6: Cover Story Candidate selector."""
from editorial_intelligence.editorial.cover_story import CoverStorySelector
from editorial_intelligence.models.enums import EditorialDecisionType, EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.story_candidate import StoryCandidate

_RULES = {"eligible_story_types": ["breaking", "release", "feature"], "min_priority_score": 70}


def _story(story_type, priority, decision=EditorialDecisionType.PUBLISH):
    event = EditorialEvent.create(
        title=f"{story_type.value}-{priority}", artist="a", event_type=EventType.ALBUM_RELEASE,
        description="", published_at="2026-08-01",
    )
    story = StoryCandidate(event=event, story_type=story_type)
    story.priority_score = priority
    story.decision = decision
    return story


def test_only_eligible_story_types_qualify():
    selector = CoverStorySelector(rules=_RULES)
    breaking = _story(StoryType.BREAKING, 90)
    community = _story(StoryType.COMMUNITY, 90)  # not eligible regardless of priority
    result = selector.candidates([breaking, community])
    assert breaking in result
    assert community not in result


def test_below_min_priority_excluded():
    selector = CoverStorySelector(rules=_RULES)
    low = _story(StoryType.RELEASE, 50)
    result = selector.candidates([low])
    assert result == []


def test_non_publish_decision_excluded():
    selector = CoverStorySelector(rules=_RULES)
    held = _story(StoryType.RELEASE, 90, decision=EditorialDecisionType.HOLD)
    result = selector.candidates([held])
    assert result == []


def test_sorted_descending_by_priority():
    selector = CoverStorySelector(rules=_RULES)
    low = _story(StoryType.RELEASE, 70)
    high = _story(StoryType.BREAKING, 100)
    result = selector.candidates([low, high])
    assert result == [high, low]


def test_limit_caps_results():
    selector = CoverStorySelector(rules=_RULES)
    stories = [_story(StoryType.RELEASE, 70 + i) for i in range(10)]
    result = selector.candidates(stories, limit=3)
    assert len(result) == 3
    assert result[0].priority_score == 79
