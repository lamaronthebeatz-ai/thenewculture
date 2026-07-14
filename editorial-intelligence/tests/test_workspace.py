"""Phase 5 (Workspace) — engine-level unit tests for status.py,
history.py, article.py, workspace.py, archive.py, export.py, metrics.py.

CLI-level coverage (the 7 new `editorial ...` commands wired into
scripts/editorial.py) lives in test_cli.py alongside the Phase 4 CLI
tests, following the same pattern used there.
"""
import pytest

from editorial_intelligence.models.enums import EventType, SourceTier, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source
from editorial_intelligence.models.story_candidate import EditorialAssignment, StoryCandidate
from editorial_intelligence.workspace.archive import ArchiveEngine
from editorial_intelligence.workspace.article import Article
from editorial_intelligence.workspace.export import ExportEngine
from editorial_intelligence.workspace.history import HistoryEngine
from editorial_intelligence.workspace.metrics import MetricsEngine
from editorial_intelligence.workspace.status import (
    ArticleStatus,
    InvalidTransitionError,
    STATUS_ORDER,
    StatusEngine,
    TRANSITION_LABELS,
)
from editorial_intelligence.workspace.workspace import Workspace


def _story(title="Album X", artist="Nghệ Sĩ A", story_type=StoryType.RELEASE, priority=50, series="tnc-records"):
    event = EditorialEvent.create(
        title=title, artist=artist, event_type=EventType.ALBUM_RELEASE, description="mô tả", published_at="2026-08-20",
    )
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://example.com"))
    event.suggested_series = series
    story = StoryCandidate(event=event, story_type=story_type)
    story.priority_score = priority
    story.assignment = EditorialAssignment(
        suggested_series=series,
        suggested_category="Release",
        suggested_tags=["#TNC"],
        suggested_profiles=["nghe-si-a"],
        suggested_internal_links=["Nghệ Sĩ B"],
        suggested_length="400-600",
    )
    return story


# ---------------------------------------------------------------------
# status.py
# ---------------------------------------------------------------------

def test_status_order_covers_all_nine_states():
    assert len(STATUS_ORDER) == 9
    assert STATUS_ORDER[0] == ArticleStatus.NEW
    assert STATUS_ORDER[-1] == ArticleStatus.ARCHIVED


def test_transition_labels_cover_every_status():
    for status in ArticleStatus:
        assert status in TRANSITION_LABELS


def test_next_status_walks_the_full_chain():
    engine = StatusEngine()
    current = ArticleStatus.NEW
    seen = [current]
    while engine.can_advance(current):
        current = engine.next_status(current)
        seen.append(current)
    assert seen == STATUS_ORDER


def test_next_status_returns_none_after_archived():
    engine = StatusEngine()
    assert engine.next_status(ArticleStatus.ARCHIVED) is None
    assert engine.can_advance(ArticleStatus.ARCHIVED) is False


def test_validate_transition_accepts_the_correct_next_step():
    engine = StatusEngine()
    engine.validate_transition(ArticleStatus.NEW, ArticleStatus.PENDING_REVIEW)  # no raise


def test_validate_transition_rejects_skipping_ahead():
    engine = StatusEngine()
    with pytest.raises(InvalidTransitionError):
        engine.validate_transition(ArticleStatus.NEW, ArticleStatus.WRITING)


def test_validate_transition_rejects_moving_backward():
    engine = StatusEngine()
    with pytest.raises(InvalidTransitionError):
        engine.validate_transition(ArticleStatus.WRITING, ArticleStatus.NEW)


# ---------------------------------------------------------------------
# history.py
# ---------------------------------------------------------------------

def test_history_engine_records_label_status_and_timestamp():
    history = []
    entry = HistoryEngine().record(history, ArticleStatus.PROMPT_READY, note="ghi chú")
    assert history == [entry]
    assert entry.label == "Prompt Generated"
    assert entry.status == "prompt_ready"
    assert entry.note == "ghi chú"
    assert entry.timestamp


# ---------------------------------------------------------------------
# article.py
# ---------------------------------------------------------------------

def test_article_properties_delegate_to_story():
    story = _story(title="Album X", priority=77, series="tnc-records", story_type=StoryType.RELEASE)
    article = Article(story=story)
    assert article.id == story.event.id
    assert article.title == "Album X"
    assert article.series == "tnc-records"
    assert article.story_type == StoryType.RELEASE
    assert article.priority == 77
    assert article.status == ArticleStatus.NEW


# ---------------------------------------------------------------------
# workspace.py
# ---------------------------------------------------------------------

def test_create_article_records_created_history():
    ws = Workspace()
    article = ws.create_article(_story())
    assert article.status == ArticleStatus.NEW
    assert len(article.history) == 1
    assert article.history[0].label == "Created"
    assert article.created == article.updated


def test_create_article_is_idempotent_by_id():
    ws = Workspace()
    story = _story()
    first = ws.create_article(story)
    second = ws.create_article(story)
    assert first is second
    assert len(ws.all_articles()) == 1


def test_find_exact_and_prefix_match():
    ws = Workspace()
    article = ws.create_article(_story())
    assert ws.find(article.id) is article
    assert ws.find(article.id[:8]) is article


def test_find_returns_none_for_unknown_id():
    ws = Workspace()
    ws.create_article(_story())
    assert ws.find("doesnotexist") is None


def test_advance_moves_one_step_and_records_history():
    ws = Workspace()
    article = ws.create_article(_story())
    ws.advance(article)
    assert article.status == ArticleStatus.PENDING_REVIEW
    assert article.history[-1].label == "Queued for Review"


def test_advance_sets_published_timestamp_on_publish():
    ws = Workspace()
    article = ws.create_article(_story())
    for _ in range(6):
        ws.advance(article)
    assert article.status == ArticleStatus.READY_TO_PUBLISH
    ws.advance(article)
    assert article.status == ArticleStatus.PUBLISHED
    assert article.published is not None
    assert article.published == article.updated


def test_advance_refuses_to_go_past_published():
    ws = Workspace()
    article = ws.create_article(_story())
    for _ in range(7):
        ws.advance(article)
    assert article.status == ArticleStatus.PUBLISHED
    with pytest.raises(InvalidTransitionError):
        ws.advance(article)


def test_set_prompt_path_and_markdown_path():
    ws = Workspace()
    article = ws.create_article(_story())
    ws.set_prompt_path(article, "prompts/x.txt")
    assert article.prompt_path == "prompts/x.txt"
    ws.set_markdown_path(article, "draft-x.md")
    assert article.markdown_path == "draft-x.md"


def test_assign_editor():
    ws = Workspace()
    article = ws.create_article(_story())
    ws.assign_editor(article, "Lam")
    assert article.assigned_editor == "Lam"


def test_workspace_can_be_seeded_with_existing_articles():
    ws1 = Workspace()
    article = ws1.create_article(_story())
    ws2 = Workspace(articles=ws1.all_articles())
    assert ws2.find(article.id) is not None


# ---------------------------------------------------------------------
# archive.py
# ---------------------------------------------------------------------

def test_archive_requires_published_status():
    article = Article(story=_story())
    with pytest.raises(InvalidTransitionError):
        ArchiveEngine().archive(article)


def test_archive_transitions_published_to_archived():
    ws = Workspace()
    article = ws.create_article(_story())
    for _ in range(7):
        ws.advance(article)
    assert article.status == ArticleStatus.PUBLISHED

    ArchiveEngine().archive(article, note="xong issue 001")
    assert article.status == ArticleStatus.ARCHIVED
    assert article.history[-1].label == "Archived"
    assert article.history[-1].note == "xong issue 001"


# ---------------------------------------------------------------------
# export.py
# ---------------------------------------------------------------------

def test_export_includes_all_required_sections():
    article = Article(story=_story(), created="2026-01-01T00:00:00+00:00", updated="2026-01-01T00:00:00+00:00")
    HistoryEngine().record(article.history, ArticleStatus.NEW)
    text = ExportEngine().export(article)

    for heading in ["## Editorial Metadata", "## Frontmatter", "## Source List", "## Assignment", "## History", "## Markdown"]:
        assert heading in text
    assert "tnc-records" in text
    assert "Nghệ Sĩ B" in text  # suggested internal link, from Assignment


def test_export_reports_missing_markdown_by_default():
    article = Article(story=_story())
    text = ExportEngine().export(article)
    assert "chưa có Markdown" in text


def test_export_reads_markdown_file_when_path_set(tmp_path):
    md_path = tmp_path / "draft.md"
    md_path.write_text("nội dung bài viết", encoding="utf-8")
    article = Article(story=_story(), markdown_path=str(md_path))
    text = ExportEngine().export(article)
    assert "nội dung bài viết" in text


def test_export_write_creates_file(tmp_path):
    article = Article(story=_story())
    out_path = tmp_path / "export.md"
    content = ExportEngine().write(article, str(out_path))
    assert out_path.read_text(encoding="utf-8") == content


def test_export_handles_missing_assignment():
    story = _story()
    story.assignment = None
    article = Article(story=story)
    text = ExportEngine().export(article)
    assert "chưa có Assignment" in text


def test_export_handles_empty_history():
    article = Article(story=_story())
    text = ExportEngine().export(article)
    assert "chưa có lịch sử" in text


# ---------------------------------------------------------------------
# metrics.py
# ---------------------------------------------------------------------

def test_metrics_empty_pool():
    stats = MetricsEngine().compute([])
    assert stats.pending == 0
    assert stats.writing == 0
    assert stats.review == 0
    assert stats.published == 0
    assert stats.average_writing_time_hours is None
    assert stats.average_review_time_hours is None
    assert stats.series_distribution == {}
    assert stats.story_type_distribution == {}


def test_metrics_buckets_by_status():
    ws = Workspace()
    new_article = ws.create_article(_story(title="A"))
    writing_article = ws.create_article(_story(title="B"))
    ws.advance(writing_article)  # pending_review
    ws.advance(writing_article)  # prompt_ready
    review_article = ws.create_article(_story(title="C"))
    for _ in range(4):
        ws.advance(review_article)  # -> draft_ready

    stats = MetricsEngine().compute(ws.all_articles())
    assert stats.pending == 1
    assert stats.writing == 1
    assert stats.review == 1
    assert stats.published == 0


def test_metrics_computes_average_writing_and_review_time():
    ws = Workspace()
    article = ws.create_article(_story())
    for _ in range(7):
        ws.advance(article)
    stats = MetricsEngine().compute([article])
    assert stats.average_writing_time_hours is not None
    assert stats.average_writing_time_hours >= 0
    assert stats.average_review_time_hours is not None
    assert stats.average_review_time_hours >= 0


def test_metrics_distributions_group_by_series_and_story_type():
    stories = [
        _story(title="A", series="tnc-records", story_type=StoryType.RELEASE),
        _story(title="B", series="tnc-records", story_type=StoryType.RELEASE),
        _story(title="C", series=None, story_type=StoryType.COMMUNITY),
    ]
    ws = Workspace()
    for s in stories:
        ws.create_article(s)
    stats = MetricsEngine().compute(ws.all_articles())
    assert stats.series_distribution["tnc-records"] == 2
    assert stats.series_distribution["(chưa xác định)"] == 1
    assert stats.story_type_distribution["release"] == 2
    assert stats.story_type_distribution["community"] == 1
