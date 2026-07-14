"""In-memory EventQueue — the only implementation shipped in Phase 1.

Lives entirely in process memory; restarting the process clears it. That
is intentional for Phase 1 (section II: "Không implement database") and
is exactly why EventQueue is an interface: swapping this out later for a
persistent store is a new file in this same folder, not a rewrite of
anything that depends on EventQueue.
"""
from typing import Dict, List, Optional

from ..models.enums import EventStatus
from ..models.event import EditorialEvent

from .interface import EventQueue


class InMemoryEventQueue(EventQueue):
    def __init__(self) -> None:
        self._events: Dict[str, EditorialEvent] = {}

    def push(self, event: EditorialEvent) -> None:
        self._events[event.id] = event

    def get(self, event_id: str) -> Optional[EditorialEvent]:
        return self._events.get(event_id)

    def all(self) -> List[EditorialEvent]:
        return list(self._events.values())

    def update_status(self, event_id: str, status: EventStatus) -> None:
        event = self._events.get(event_id)
        if event is not None:
            event.status = status
