"""Worker Logger (Phase 6) — run id / start / finish / duration /
events / errors, per the spec's LOGGING section.

In-memory only; the CLI (scripts/editorial.py) decides whether/where to
persist a run's log to JSON, the same split every other Phase 1-5
persistence concern already uses (see workspace.py's own docstring).
"""
import datetime
import uuid
from dataclasses import dataclass, field
from typing import List, Optional

_LEVELS = {"debug": 0, "info": 1, "warning": 2, "error": 3}


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


@dataclass
class RunLog:
    run_id: str
    started_at: str
    finished_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    events_processed: int = 0
    errors: List[str] = field(default_factory=list)
    messages: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.finished_at is not None and not self.errors


class WorkerLogger:
    def __init__(self, min_level: str = "info"):
        self._min_level = _LEVELS.get(min_level, 1)

    def start(self) -> RunLog:
        return RunLog(run_id=uuid.uuid4().hex[:12], started_at=_now())

    def log(self, run: RunLog, message: str, level: str = "info") -> None:
        if _LEVELS.get(level, 1) < self._min_level:
            return
        run.messages.append(f"[{level}] {message}")

    def error(self, run: RunLog, message: str) -> None:
        run.errors.append(message)
        run.messages.append(f"[error] {message}")

    def finish(self, run: RunLog, events_processed: int) -> RunLog:
        run.finished_at = _now()
        run.events_processed = events_processed
        started = datetime.datetime.fromisoformat(run.started_at)
        finished = datetime.datetime.fromisoformat(run.finished_at)
        run.duration_seconds = (finished - started).total_seconds()
        return run
