"""Worker (Phase 6) — the top-level orchestrator implementing exactly
the 8 Worker Responsibilities from the spec:

  1. Schedule                (scheduler.py's Scheduler.is_due)
  2. Collect Sources         (Phase 1's NewsProvider + ProviderRegistry, reused)
  3. Run CollectorPipeline   (Phase 1, reused, unchanged)
  4. Run EditorialDesk       (Phase 3, reused, unchanged)
  5. Update Workspace        (Phase 5, reused, unchanged)
  6. Generate Dashboard JSON (dashboard.py, Phase 6, new)
  7. Create Draft Branch nếu có event mới
  8. Dừng.

Absolutely no AI/OpenAI/Claude/Prompt/Markdown/Publish/Merge/Push Main
call anywhere in this file — those steps of the architecture diagram
happen later, by a human, using Phase 1-5's own CLI commands
(`editorial prompt`, `editorial markdown`, `editorial status`, ...),
never automatically from here.

Responsibility 7 ("Create Draft Branch nếu có event mới") is
implemented as a *computed branch name* only (`draft/<article_id
prefix>`) for every Article this run created brand new (still
ArticleStatus.NEW after Workspace sync) — this file never shells out to
git, never touches the network, and never pushes/merges anything. An
editor (or a separate, explicit step outside Editorial OS) is the one
who actually creates that branch, the same "prepare the brief, don't
perform the action" split PromptGenerator already uses for AI.
"""
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from ..collector.pipeline import CollectorPipeline
from ..editorial.desk import EditorialDesk
from ..models.story_candidate import StoryCandidate
from ..providers.news_provider import NewsProvider
from ..providers.registry import ProviderRegistry
from ..queue.in_memory import InMemoryEventQueue
from ..workspace.article import Article
from ..workspace.status import ArticleStatus
from ..workspace.workspace import Workspace
from .dashboard import WorkerDashboardBuilder
from .logger import RunLog, WorkerLogger
from .scheduler import Scheduler


@dataclass
class WorkerRunResult:
    run: RunLog
    ran: bool
    stories: List[StoryCandidate] = field(default_factory=list)
    articles: List[Article] = field(default_factory=list)
    dashboard: Optional[Dict[str, Any]] = None
    draft_branches: List[str] = field(default_factory=list)


class WorkerRunner:
    def __init__(
        self,
        fixtures_dir: str,
        scheduler: Optional[Scheduler] = None,
        logger: Optional[WorkerLogger] = None,
        dashboard_builder: Optional[WorkerDashboardBuilder] = None,
        max_events_per_run: Optional[int] = None,
        retry_max_attempts: int = 1,
        retry_backoff_seconds: float = 0.0,
        sleep_fn: Callable[[float], None] = time.sleep,
    ):
        self._fixtures_dir = fixtures_dir
        self._scheduler = scheduler or Scheduler()
        self._logger = logger or WorkerLogger()
        self._dashboard_builder = dashboard_builder or WorkerDashboardBuilder()
        self._max_events_per_run = max_events_per_run
        self._retry_max_attempts = max(1, retry_max_attempts)
        self._retry_backoff_seconds = retry_backoff_seconds
        self._sleep_fn = sleep_fn

    def run(
        self,
        last_run_at: Optional[str] = None,
        existing_articles: Optional[List[Article]] = None,
    ) -> WorkerRunResult:
        run = self._logger.start()

        if not self._scheduler.is_due(last_run_at):
            self._logger.log(run, f"Skipped — schedule mode '{self._scheduler.mode}' not due yet.")
            self._logger.finish(run, events_processed=0)
            return WorkerRunResult(run=run, ran=False)

        stories: Optional[List[StoryCandidate]] = None
        ws: Optional[Workspace] = None
        attempt = 0
        while attempt < self._retry_max_attempts:
            attempt += 1
            try:
                stories, ws = self._collect_and_process(existing_articles)
                break
            except Exception as exc:  # noqa: BLE001 - a fixture/provider failure, not a bare except
                self._logger.error(run, f"Attempt {attempt} failed: {exc}")
                if attempt < self._retry_max_attempts:
                    self._sleep_fn(self._retry_backoff_seconds)

        if stories is None or ws is None:
            self._logger.finish(run, events_processed=0)
            return WorkerRunResult(run=run, ran=True)

        if self._max_events_per_run is not None:
            stories = stories[: self._max_events_per_run]

        articles = ws.all_articles()
        draft_branches = [f"draft/{a.id[:8]}" for a in articles if a.status == ArticleStatus.NEW]

        dashboard = self._dashboard_builder.build(stories, articles)
        self._logger.log(
            run, f"Processed {len(stories)} stories, {len(draft_branches)} new draft branch(es)."
        )
        self._logger.finish(run, events_processed=len(stories))

        return WorkerRunResult(
            run=run, ran=True, stories=stories, articles=articles,
            dashboard=dashboard, draft_branches=draft_branches,
        )

    def _collect_and_process(self, existing_articles: Optional[List[Article]]):
        provider = NewsProvider(self._fixtures_dir)
        registry = ProviderRegistry()
        registry.register(provider)
        queue = InMemoryEventQueue()
        pipeline = CollectorPipeline(registry, queue)  # Phase 1, unchanged
        pipeline.run()

        stories = EditorialDesk().process_all(queue.all())  # Phase 3, unchanged

        ws = Workspace(articles=list(existing_articles) if existing_articles else [])
        for story in stories:
            ws.create_article(story)  # Phase 5, unchanged — idempotent by id
        return stories, ws
