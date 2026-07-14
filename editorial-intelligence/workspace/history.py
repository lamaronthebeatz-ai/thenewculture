"""History Engine (Phase 5) — append-only timeline of every status
transition an Article goes through.

Pure bookkeeping: never decides *whether* a transition is legal
(status.py's StatusEngine does that), only records that it happened.
"""
import datetime
from dataclasses import dataclass
from typing import List, Optional

from .status import ArticleStatus, TRANSITION_LABELS


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


@dataclass
class HistoryEntry:
    label: str
    status: str
    timestamp: str
    note: Optional[str] = None


class HistoryEngine:
    def record(
        self,
        history: List[HistoryEntry],
        status: ArticleStatus,
        note: Optional[str] = None,
    ) -> HistoryEntry:
        entry = HistoryEntry(
            label=TRANSITION_LABELS[status],
            status=status.value,
            timestamp=now_iso(),
            note=note,
        )
        history.append(entry)
        return entry
