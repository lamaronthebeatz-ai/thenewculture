"""Sanity check: every Phase 3 config YAML file actually parses and has
the keys its engine expects — the engines themselves are tested against
injected dicts (fast, deterministic), so this is the one place that
would catch a broken/malformed real YAML file."""
from editorial_intelligence.config.loader import (
    load_assignment_rules,
    load_cover_story_rules,
    load_dashboard_config,
    load_editorial_decision_rules,
    load_issue_balance,
    load_priority_weights,
    load_story_classification,
)


def test_load_story_classification():
    data = load_story_classification()
    assert "default_by_event_type" in data
    assert data["default_by_event_type"]["album_release"] == "release"


def test_load_priority_weights():
    data = load_priority_weights()
    assert "story_type_weights" in data
    assert data["story_type_weights"]["breaking"] == 100


def test_load_editorial_decision_rules():
    data = load_editorial_decision_rules()
    assert data["publish_priority_threshold"] > data["hold_priority_threshold"]


def test_load_assignment_rules():
    data = load_assignment_rules()
    assert "breaking" in data["suggested_length_by_story_type"]


def test_load_cover_story_rules():
    data = load_cover_story_rules()
    assert "breaking" in data["eligible_story_types"]


def test_load_issue_balance():
    data = load_issue_balance()
    assert "tnc-records" in data["target_distribution"]


def test_load_dashboard_config():
    data = load_dashboard_config()
    assert data["high_priority_threshold"] > 0
