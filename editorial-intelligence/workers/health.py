"""Health (Phase 6) — worker status / last run / last success / last
failure / duration / events processed.

Pure function over a list of RunLog entries the caller already has
(reloaded from the JSON history the CLI manages) — this module computes
nothing about how runs happened, only summarizes them.
"""
from dataclasses import dataclass
from typing import List, Optional

from .logger import RunLog


@dataclass(frozen=True)
class HealthStatus:
    status: str  # "never_run" | "ok" | "failed"
    last_run_at: Optional[str]
    last_success_at: Optional[str]
    last_failure_at: Optional[str]
    last_duration_seconds: Optional[float]
    last_events_processed: int


class HealthEngine:
    def compute(self, runs: List[RunLog]) -> HealthStatus:
        if not runs:
            return HealthStatus(
                status="never_run", last_run_at=None, last_success_at=None,
                last_failure_at=None, last_duration_seconds=None, last_events_processed=0,
            )

        last = runs[-1]
        successes = [r for r in runs if r.success]
        failures = [r for r in runs if r.finished_at is not None and r.errors]

        return HealthStatus(
            status="ok" if last.success else "failed",
            last_run_at=last.started_at,
            last_success_at=successes[-1].finished_at if successes else None,
            last_failure_at=failures[-1].finished_at if failures else None,
            last_duration_seconds=last.duration_seconds,
            last_events_processed=last.events_processed,
        )
