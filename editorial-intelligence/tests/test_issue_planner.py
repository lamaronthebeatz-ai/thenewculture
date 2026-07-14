"""Phase 3 section 5: Issue Planner — series balance, no site coupling."""
from editorial_intelligence.editorial.issue_planner import IssuePlanner
from editorial_intelligence.models.enums import EditorialDecisionType, EventType, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.story_candidate import StoryCandidate

_CONFIG = {
    "target_distribution": {"tnc-records": 3, "tnc-community": 1},
    "default_target": 1,
}


def _story(series, priority, decision=EditorialDecisionType.PUBLISH):
    event = EditorialEvent.create(
        title=f"{series}-{priority}", artist="a", event_type=EventType.ALBUM_RELEASE,
        description="", published_at="2026-08-01",
    )
    event.suggested_series = series
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    story.priority_score = priority
    story.decision = decision
    return story


def test_series_balance_report_computes_gap():
    planner = IssuePlanner(balance_config=_CONFIG)
    report = planner.series_balance_report({"tnc-records": 1})
    assert report["tnc-records"] == {"target": 3, "current": 1, "gap": 2}


def test_series_balance_report_uses_default_target_for_unconfigured_series():
    planner = IssuePlanner(balance_config=_CONFIG)
    report = planner.series_balance_report({"tnc-selects": 0})
    assert report["tnc-selects"] == {"target": 1, "current": 0, "gap": 1}


def test_suggest_for_issue_only_publish_decisions():
    planner = IssuePlanner(balance_config=_CONFIG)
    held = _story("tnc-records", 90, decision=EditorialDecisionType.HOLD)
    result = planner.suggest_for_issue([held], current_counts={})
    assert result == []


def test_suggest_for_issue_prioritizes_understocked_series():
    planner = IssuePlanner(balance_config=_CONFIG)
    # tnc-community target=1, current=0 -> gap 1; tnc-records target=3, current=2 -> gap 1
    # equal gap -> higher priority wins
    community = _story("tnc-community", 50)
    records = _story("tnc-records", 90)
    result = planner.suggest_for_issue([community, records], current_counts={"tnc-records": 2, "tnc-community": 0})
    assert result[0] is records  # same gap (1), higher priority


def test_suggest_for_issue_bigger_gap_wins_over_priority():
    planner = IssuePlanner(balance_config=_CONFIG)
    # tnc-records gap = 3 (current 0), tnc-community gap = 1 (current 0)
    records = _story("tnc-records", 10)
    community = _story("tnc-community", 100)
    result = planner.suggest_for_issue([records, community], current_counts={})
    assert result[0] is records  # bigger gap wins even with lower priority


def test_suggest_for_issue_respects_limit():
    planner = IssuePlanner(balance_config=_CONFIG)
    stories = [_story("tnc-records", 50 + i) for i in range(5)]
    result = planner.suggest_for_issue(stories, current_counts={}, limit=2)
    assert len(result) == 2
