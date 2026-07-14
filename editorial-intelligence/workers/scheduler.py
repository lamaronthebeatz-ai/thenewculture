"""Scheduler (Phase 6) — decides whether a run is due, for
manual/hourly/daily/weekly modes.

No real cron/timer — a pure function of "mode + last_run_at + now",
matching the spec's "Worker phải mock hoàn toàn. Không network."
"""
import datetime
from typing import Optional

_INTERVALS = {
    "hourly": datetime.timedelta(hours=1),
    "daily": datetime.timedelta(days=1),
    "weekly": datetime.timedelta(weeks=1),
}
_MODES = ("manual", "hourly", "daily", "weekly")


class Scheduler:
    def __init__(self, mode: str = "manual"):
        if mode not in _MODES:
            raise ValueError(f"Unknown schedule mode: {mode!r} (expected one of {_MODES})")
        self._mode = mode

    @property
    def mode(self) -> str:
        return self._mode

    def is_due(self, last_run_at: Optional[str], now: Optional[datetime.datetime] = None) -> bool:
        """`manual` is always due — an explicit `editorial worker run`
        call always runs. hourly/daily/weekly are due only if no run has
        happened yet, or the interval has elapsed since the last one."""
        if self._mode == "manual":
            return True
        if last_run_at is None:
            return True
        now = now or datetime.datetime.now(datetime.timezone.utc)
        last = datetime.datetime.fromisoformat(last_run_at)
        return now - last >= _INTERVALS[self._mode]
