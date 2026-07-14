"""Phase 4: scripts/editorial.py — the CLI entrypoint.

Imports the script directly (it lives in scripts/, not inside the
editorial-intelligence package) via the same importlib approach the
script itself uses for the package — `scripts/` has no `__init__.py`
and no name collision risk (unlike `queue`), so a plain sys.path append
+ `import editorial` is sufficient and simplest here.
"""
import importlib
import json
import os
import sys

import pytest

_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "scripts")
_SCRIPTS_DIR = os.path.normpath(_SCRIPTS_DIR)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

editorial_cli = importlib.import_module("editorial")

from editorial_intelligence.models.enums import (  # noqa: E402
    EditorialDecisionType, EventStatus, EventType, SourceTier, StoryType,
)
from editorial_intelligence.models.event import EditorialEvent  # noqa: E402
from editorial_intelligence.models.mapping_result import MappingResult  # noqa: E402
from editorial_intelligence.models.source import Source  # noqa: E402
from editorial_intelligence.models.story_candidate import EditorialAssignment, StoryCandidate  # noqa: E402

_FIXTURES_DIR = os.path.join(editorial_cli.EI_ROOT, "tests", "fixtures", "news")


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path, monkeypatch):
    """Every test gets its own state dir — never touches the real
    editorial-intelligence/.cli-state/ or leaves files behind."""
    state_dir = tmp_path / "cli-state"
    state_file = state_dir / "stories.json"
    monkeypatch.setattr(editorial_cli, "STATE_DIR", str(state_dir))
    monkeypatch.setattr(editorial_cli, "STATE_FILE", str(state_file))
    yield


def _full_story(title="Album X", artist="Nghệ Sĩ A", story_type=StoryType.RELEASE,
                 decision=EditorialDecisionType.PUBLISH, priority=90, confidence=80,
                 series="tnc-records", related_artists=None):
    event = EditorialEvent.create(
        title=title, artist=artist, event_type=EventType.ALBUM_RELEASE,
        description="mô tả", published_at="2026-08-01",
    )
    event.confidence = confidence
    event.status = EventStatus.PENDING_REVIEW
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://example.com"))
    event.suggested_series = series
    event.suggested_tags = ["#TNC"]
    event.related_artists = related_artists or []
    event.mapping_result = MappingResult(category="Release", series=series, homepage=True, magazine=True)
    story = StoryCandidate(event=event, story_type=story_type)
    story.priority_score = priority
    story.decision = decision
    story.decision_reason = "test"
    story.assignment = EditorialAssignment(
        suggested_series=series, suggested_category="Release", suggested_tags=["#TNC"],
        suggested_profiles=["nghe-si-a"], suggested_internal_links=list(related_artists or []),
        suggested_length="400-600",
    )
    return story


# ---------------------------------------------------------------------
# Serialization round-trip
# ---------------------------------------------------------------------

def test_story_serialization_round_trip_preserves_everything():
    story = _full_story(related_artists=["Nghệ Sĩ D"])
    story.editorial_notes = ["ghi chú test"]

    restored = editorial_cli._story_from_dict(editorial_cli._story_to_dict(story))

    assert restored.event.id == story.event.id
    assert restored.event.title == story.event.title
    assert restored.event.event_type == EventType.ALBUM_RELEASE
    assert restored.event.status == EventStatus.PENDING_REVIEW
    assert restored.event.sources[0].tier == SourceTier.TIER_1
    assert restored.event.mapping_result.homepage is True
    assert restored.story_type == StoryType.RELEASE
    assert restored.decision == EditorialDecisionType.PUBLISH
    assert restored.priority_score == 90
    assert restored.assignment.suggested_length == "400-600"
    assert restored.editorial_notes == ["ghi chú test"]


def test_save_and_load_stories_round_trip(tmp_path):
    stories = [_full_story(title="A"), _full_story(title="B", decision=EditorialDecisionType.HOLD)]
    editorial_cli.save_stories(stories)

    loaded = editorial_cli.load_stories()
    assert {s.event.title for s in loaded} == {"A", "B"}


def test_load_stories_returns_empty_list_when_no_state_file():
    assert editorial_cli.load_stories() == []


# ---------------------------------------------------------------------
# find_story
# ---------------------------------------------------------------------

def test_find_story_exact_and_prefix_match():
    story = _full_story()
    assert editorial_cli.find_story([story], story.event.id) is story
    assert editorial_cli.find_story([story], story.event.id[:6]) is story


def test_find_story_returns_none_for_no_match():
    story = _full_story()
    assert editorial_cli.find_story([story], "does-not-exist") is None


def test_find_story_returns_none_for_ambiguous_prefix():
    a = _full_story(title="A")
    b = _full_story(title="B")
    # Force a shared prefix deterministically instead of relying on the
    # natural hash-derived ids to happen to collide.
    a.event.id = "abc111"
    b.event.id = "abc222"
    assert editorial_cli.find_story([a, b], "abc") is None


# ---------------------------------------------------------------------
# collect
# ---------------------------------------------------------------------

def test_cmd_collect_runs_full_pipeline_and_saves_state(capsys):
    args = argparse_namespace(fixtures=_FIXTURES_DIR)
    rc = editorial_cli.cmd_collect(args)
    assert rc == 0

    out = capsys.readouterr().out
    for step in editorial_cli.COLLECT_STEPS:
        assert f"[OK] {step}" in out
    assert "New events" in out

    stories = editorial_cli.load_stories()
    assert len(stories) == 3  # 3 fixture files


# ---------------------------------------------------------------------
# queue / dashboard / issue / review — empty + populated
# ---------------------------------------------------------------------

def test_cmd_queue_empty(capsys):
    rc = editorial_cli.cmd_queue(argparse_namespace())
    assert rc == 0
    assert "Queue rỗng" in capsys.readouterr().out


def test_cmd_queue_buckets(capsys):
    editorial_cli.save_stories([
        _full_story(title="Publish me", decision=EditorialDecisionType.PUBLISH),
        _full_story(title="Hold me", decision=EditorialDecisionType.HOLD),
        _full_story(title="Reject me", decision=EditorialDecisionType.REJECT),
        _full_story(title="Need more", decision=EditorialDecisionType.NEED_MORE_SOURCES),
    ])
    editorial_cli.cmd_queue(argparse_namespace())
    out = capsys.readouterr().out
    assert "=== Publish Ready (1) ===" in out
    assert "Publish me" in out
    assert "=== Hold (1) ===" in out
    assert "Hold me" in out
    assert "=== Rejected (1) ===" in out
    assert "=== Need More Sources (1) ===" in out


def test_cmd_dashboard_empty(capsys):
    rc = editorial_cli.cmd_dashboard(argparse_namespace())
    assert rc == 0
    assert "Queue rỗng" in capsys.readouterr().out


def test_cmd_dashboard_populated(capsys):
    editorial_cli.save_stories([
        _full_story(title="A", priority=90, confidence=80),
        _full_story(title="B", priority=10, confidence=20, decision=EditorialDecisionType.HOLD),
    ])
    editorial_cli.cmd_dashboard(argparse_namespace())
    out = capsys.readouterr().out
    assert "Total Events      : 2" in out
    assert "Average Confidence: 50.0" in out
    assert "Average Priority  : 50.0" in out
    assert "Top Story         : A" in out


def test_cmd_issue_reports_balance_and_missing(capsys):
    editorial_cli.save_stories([_full_story(series="tnc-records")])
    editorial_cli.cmd_issue(argparse_namespace())
    out = capsys.readouterr().out
    assert "=== Issue Balance ===" in out
    assert "tnc-records" in out
    assert "=== Missing Categories ===" in out


def test_cmd_issue_empty(capsys):
    rc = editorial_cli.cmd_issue(argparse_namespace())
    assert rc == 0
    assert "Queue rỗng" in capsys.readouterr().out


def test_cmd_review_groups_by_decision(capsys):
    editorial_cli.save_stories([
        _full_story(title="P", decision=EditorialDecisionType.PUBLISH),
        _full_story(title="R", decision=EditorialDecisionType.REJECT),
    ])
    editorial_cli.cmd_review(argparse_namespace())
    out = capsys.readouterr().out
    assert "=== Publish (1) ===" in out
    assert "P" in out
    assert "=== Reject (1) ===" in out


def test_cmd_review_empty(capsys):
    rc = editorial_cli.cmd_review(argparse_namespace())
    assert rc == 0
    assert "Queue rỗng" in capsys.readouterr().out


# ---------------------------------------------------------------------
# prompt / markdown / recommend
# ---------------------------------------------------------------------

def test_cmd_prompt_prints_full_prompt_and_persists_prompted_status(capsys):
    story = _full_story()
    editorial_cli.save_stories([story])

    rc = editorial_cli.cmd_prompt(argparse_namespace(event_id=story.event.id))
    assert rc == 0
    out = capsys.readouterr().out
    assert "## Editorial Guideline" in out
    assert "## Story Type" in out

    reloaded = editorial_cli.load_stories()[0]
    assert reloaded.event.status == EventStatus.PROMPTED


def test_cmd_prompt_unknown_id(capsys):
    editorial_cli.save_stories([_full_story()])
    rc = editorial_cli.cmd_prompt(argparse_namespace(event_id="nope"))
    assert rc == 1
    assert "Không tìm thấy" in capsys.readouterr().out


def test_cmd_prompt_low_confidence_refused(capsys):
    story = _full_story(confidence=1)
    editorial_cli.save_stories([story])
    rc = editorial_cli.cmd_prompt(argparse_namespace(event_id=story.event.id))
    assert rc == 1
    assert "Không thể sinh Prompt" in capsys.readouterr().out


def test_cmd_markdown_writes_file(tmp_path, capsys):
    story = _full_story()
    editorial_cli.save_stories([story])
    output_path = str(tmp_path / "draft.md")

    rc = editorial_cli.cmd_markdown(argparse_namespace(event_id=story.event.id, output=output_path))
    assert rc == 0
    assert os.path.exists(output_path)
    content = open(output_path, encoding="utf-8").read()
    assert content.startswith("---\n")
    assert "title:" in content
    assert "Đã sinh" in capsys.readouterr().out


def test_cmd_markdown_default_output_path(tmp_path, monkeypatch, capsys):
    story = _full_story()
    editorial_cli.save_stories([story])
    monkeypatch.chdir(tmp_path)

    rc = editorial_cli.cmd_markdown(argparse_namespace(event_id=story.event.id, output=None))
    assert rc == 0
    expected = f"draft-{story.event.id[:8]}.md"
    assert os.path.exists(expected)


def test_cmd_markdown_unknown_id(capsys):
    rc = editorial_cli.cmd_markdown(argparse_namespace(event_id="nope", output=None))
    assert rc == 1


def test_cmd_recommend_sections(capsys):
    a = _full_story(title="Album A", artist="Nghệ Sĩ A", related_artists=["Nghệ Sĩ D"])
    b = _full_story(title="Album B", artist="Nghệ Sĩ A")  # same artist -> related
    editorial_cli.save_stories([a, b])

    rc = editorial_cli.cmd_recommend(argparse_namespace(event_id=a.event.id))
    assert rc == 0
    out = capsys.readouterr().out
    assert "=== Related Articles ===" in out
    assert "=== Related Artists ===" in out
    assert "Nghệ Sĩ D" in out
    assert "=== Related Releases ===" in out
    assert "Album B" in out
    assert "=== Related Timeline ===" in out
    assert "=== Related Events ===" in out


def test_cmd_recommend_unknown_id(capsys):
    rc = editorial_cli.cmd_recommend(argparse_namespace(event_id="nope"))
    assert rc == 1


# ---------------------------------------------------------------------
# argparse wiring / main()
# ---------------------------------------------------------------------

def test_build_parser_has_all_commands():
    parser = editorial_cli.build_parser()
    actions = [a for a in parser._subparsers._group_actions for a in getattr(a, "choices", {})]
    for command in ["collect", "queue", "dashboard", "prompt", "markdown", "issue", "recommend", "review"]:
        assert command in actions


def test_main_dispatches_to_dashboard(capsys):
    rc = editorial_cli.main(["dashboard"])
    assert rc == 0
    assert "Queue rỗng" in capsys.readouterr().out


def test_main_requires_a_command():
    with pytest.raises(SystemExit):
        editorial_cli.main([])


def test_main_prompt_requires_event_id():
    with pytest.raises(SystemExit):
        editorial_cli.main(["prompt"])


class argparse_namespace:
    """Tiny stand-in for argparse.Namespace so command tests don't need
    to go through the real parser — each cmd_* function only reads a
    couple of known attributes."""

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
