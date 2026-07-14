"""Phase 6 (Worker) — engine-level unit tests for config.py, logger.py,
scheduler.py, dashboard.py, health.py, worker.py.

No network, no real git, no AI/API call anywhere in workers/ — the
tests below exercise everything through fixtures already used by the
rest of the test suite (editorial-intelligence/tests/fixtures/news) and
in-memory fakes, matching the spec's "Worker phải mock hoàn toàn."

CLI-level coverage (`editorial worker run/status/dashboard/health`)
lives in test_cli.py alongside the Phase 4/5 CLI tests.
"""
import datetime
import os

import pytest

from editorial_intelligence.models.enums import EventType, SourceTier, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source
from editorial_intelligence.models.story_candidate import StoryCandidate
from editorial_intelligence.workers.config import load_worker_config
from editorial_intelligence.workers.dashboard import WorkerDashboardBuilder
from editorial_intelligence.workers.health import HealthEngine
from editorial_intelligence.workers.logger import RunLog, WorkerLogger
from editorial_intelligence.workers.scheduler import Scheduler
from editorial_intelligence.workers.worker import WorkerRunner
from editorial_intelligence.workspace.article import Article
from editorial_intelligence.workspace.status import ArticleStatus
from editorial_intelligence.workspace.workspace import Workspace

_FIXTURES_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "fixtures", "news"
)


def _story(title="Album X", artist="Nghệ Sĩ A", priority=50, series="tnc-records"):
    event = EditorialEvent.create(
        title=title, artist=artist, event_type=EventType.ALBUM_RELEASE, description="mô tả", published_at="2026-08-20",
    )
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    event.suggested_series = series
    story = StoryCandidate(event=event, story_type=StoryType.RELEASE)
    story.priority_score = priority
    return story


# ---------------------------------------------------------------------
# config.py
# ---------------------------------------------------------------------

def test_load_worker_config_has_all_sections():
    config = load_worker_config()
    for key in ("schedule", "providers", "limits", "retry", "logging"):
        assert key in config
    assert config["schedule"]["mode"] == "manual"


def test_load_worker_config_accepts_explicit_path(tmp_path):
    path = tmp_path / "custom.yaml"
    path.write_text("schedule:\n  mode: hourly\n", encoding="utf-8")
    config = load_worker_config(str(path))
    assert config["schedule"]["mode"] == "hourly"


# ---------------------------------------------------------------------
# logger.py
# ---------------------------------------------------------------------

def test_worker_logger_start_finish_computes_duration():
    logger = WorkerLogger()
    run = logger.start()
    assert run.run_id
    assert run.started_at
    assert run.finished_at is None

    logger.finish(run, events_processed=5)
    assert run.finished_at is not None
    assert run.events_processed == 5
    assert run.duration_seconds is not None
    assert run.duration_seconds >= 0


def test_worker_logger_error_marks_run_unsuccessful():
    logger = WorkerLogger()
    run = logger.start()
    logger.error(run, "something broke")
    logger.finish(run, events_processed=0)
    assert run.errors == ["something broke"]
    assert run.success is False


def test_worker_logger_success_true_when_no_errors():
    logger = WorkerLogger()
    run = logger.start()
    logger.finish(run, events_processed=1)
    assert run.success is True


def test_worker_logger_filters_below_min_level():
    logger = WorkerLogger(min_level="warning")
    run = logger.start()
    logger.log(run, "just info", level="info")
    logger.log(run, "a warning", level="warning")
    assert run.messages == ["[warning] a warning"]


# ---------------------------------------------------------------------
# scheduler.py
# ---------------------------------------------------------------------

def test_scheduler_rejects_unknown_mode():
    with pytest.raises(ValueError):
        Scheduler(mode="biweekly")


def test_scheduler_manual_always_due():
    scheduler = Scheduler(mode="manual")
    assert scheduler.is_due(None) is True
    assert scheduler.is_due("2026-01-01T00:00:00+00:00") is True


def test_scheduler_first_run_always_due():
    scheduler = Scheduler(mode="daily")
    assert scheduler.is_due(None) is True


def test_scheduler_hourly_not_due_before_interval():
    scheduler = Scheduler(mode="hourly")
    now = datetime.datetime(2026, 1, 1, 12, 0, tzinfo=datetime.timezone.utc)
    last_run_at = (now - datetime.timedelta(minutes=30)).isoformat()
    assert scheduler.is_due(last_run_at, now=now) is False


def test_scheduler_hourly_due_after_interval():
    scheduler = Scheduler(mode="hourly")
    now = datetime.datetime(2026, 1, 1, 12, 0, tzinfo=datetime.timezone.utc)
    last_run_at = (now - datetime.timedelta(hours=2)).isoformat()
    assert scheduler.is_due(last_run_at, now=now) is True


def test_scheduler_daily_and_weekly_boundaries():
    now = datetime.datetime(2026, 1, 10, tzinfo=datetime.timezone.utc)
    daily = Scheduler(mode="daily")
    assert daily.is_due((now - datetime.timedelta(hours=23)).isoformat(), now=now) is False
    assert daily.is_due((now - datetime.timedelta(days=1)).isoformat(), now=now) is True

    weekly = Scheduler(mode="weekly")
    assert weekly.is_due((now - datetime.timedelta(days=6)).isoformat(), now=now) is False
    assert weekly.is_due((now - datetime.timedelta(weeks=1)).isoformat(), now=now) is True


# ---------------------------------------------------------------------
# dashboard.py
# ---------------------------------------------------------------------

def test_worker_dashboard_builder_empty_pool():
    result = WorkerDashboardBuilder().build([], [])
    assert result["pending"] == 0
    assert result["cover_story"] is None
    assert result["top_story"] is None
    assert result["average_confidence"] is None
    assert result["average_priority"] is None
    assert result["issue_planning"] == []
    assert "series_balance" in result


def test_worker_dashboard_builder_reports_top_story_and_averages():
    a = _story(title="A", priority=90)
    a.event.confidence = 80
    b = _story(title="B", priority=10)
    b.event.confidence = 20
    ws = Workspace()
    ws.create_article(a)
    ws.create_article(b)

    result = WorkerDashboardBuilder().build([a, b], ws.all_articles())
    assert result["top_story"] == "A"
    assert result["average_confidence"] == 50.0
    assert result["average_priority"] == 50.0
    assert result["pending"] == 2


def test_worker_dashboard_builder_ready_uses_publish_decision():
    from editorial_intelligence.models.enums import EditorialDecisionType

    story = _story()
    story.decision = EditorialDecisionType.PUBLISH
    result = WorkerDashboardBuilder().build([story], [])
    assert result["ready"] == 1


# ---------------------------------------------------------------------
# health.py
# ---------------------------------------------------------------------

def test_health_engine_never_run():
    status = HealthEngine().compute([])
    assert status.status == "never_run"
    assert status.last_run_at is None


def test_health_engine_ok_after_successful_run():
    logger = WorkerLogger()
    run = logger.start()
    logger.finish(run, events_processed=3)
    status = HealthEngine().compute([run])
    assert status.status == "ok"
    assert status.last_success_at == run.finished_at
    assert status.last_failure_at is None
    assert status.last_events_processed == 3


def test_health_engine_failed_after_error_run():
    logger = WorkerLogger()
    run = logger.start()
    logger.error(run, "boom")
    logger.finish(run, events_processed=0)
    status = HealthEngine().compute([run])
    assert status.status == "failed"
    assert status.last_failure_at == run.finished_at
    assert status.last_success_at is None


def test_health_engine_tracks_last_success_and_failure_independently():
    logger = WorkerLogger()
    ok_run = logger.start()
    logger.finish(ok_run, events_processed=1)

    failed_run = logger.start()
    logger.error(failed_run, "boom")
    logger.finish(failed_run, events_processed=0)

    status = HealthEngine().compute([ok_run, failed_run])
    assert status.status == "failed"  # last run is the failed one
    assert status.last_success_at == ok_run.finished_at
    assert status.last_failure_at == failed_run.finished_at


# ---------------------------------------------------------------------
# worker.py
# ---------------------------------------------------------------------

def test_worker_runner_skips_when_not_due():
    scheduler = Scheduler(mode="hourly")
    runner = WorkerRunner(fixtures_dir=_FIXTURES_DIR, scheduler=scheduler)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = runner.run(last_run_at=now)
    assert result.ran is False
    assert result.stories == []


def test_worker_runner_full_run_over_fixtures():
    runner = WorkerRunner(fixtures_dir=_FIXTURES_DIR)
    result = runner.run()
    assert result.ran is True
    assert len(result.stories) == 3
    assert len(result.articles) == 3
    assert result.dashboard is not None
    assert result.run.events_processed == 3
    assert result.run.errors == []
    assert all(a.status == ArticleStatus.NEW for a in result.articles)
    assert len(result.draft_branches) == 3
    assert all(b.startswith("draft/") for b in result.draft_branches)


def test_worker_runner_respects_max_events_per_run():
    runner = WorkerRunner(fixtures_dir=_FIXTURES_DIR, max_events_per_run=1)
    result = runner.run()
    assert len(result.stories) == 1


def test_worker_runner_reuses_existing_articles_idempotently():
    runner = WorkerRunner(fixtures_dir=_FIXTURES_DIR)
    first = runner.run()
    second = runner.run(existing_articles=first.articles)
    assert len(second.articles) == 3
    # Idempotent: re-running with the same existing articles doesn't add duplicates.
    first_ids = {a.id for a in first.articles}
    second_ids = {a.id for a in second.articles}
    assert first_ids == second_ids


def test_worker_runner_retries_and_recovers(monkeypatch):
    calls = {"count": 0}
    real_collect = WorkerRunner._collect_and_process

    def flaky_collect(self, existing_articles):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("simulated fixture read failure")
        return real_collect(self, existing_articles)

    monkeypatch.setattr(WorkerRunner, "_collect_and_process", flaky_collect)

    sleeps = []
    runner = WorkerRunner(
        fixtures_dir=_FIXTURES_DIR, retry_max_attempts=2, retry_backoff_seconds=0.01,
        sleep_fn=lambda seconds: sleeps.append(seconds),
    )
    result = runner.run()
    assert result.ran is True
    assert len(result.stories) == 3
    assert len(result.run.errors) == 1
    assert sleeps == [0.01]


def test_worker_runner_gives_up_after_exhausting_retries(monkeypatch):
    def always_fails(self, existing_articles):
        raise RuntimeError("always broken")

    monkeypatch.setattr(WorkerRunner, "_collect_and_process", always_fails)

    runner = WorkerRunner(fixtures_dir=_FIXTURES_DIR, retry_max_attempts=2, retry_backoff_seconds=0, sleep_fn=lambda s: None)
    result = runner.run()
    assert result.ran is True
    assert result.stories == []
    assert result.dashboard is None
    assert len(result.run.errors) == 2
    assert result.run.success is False
