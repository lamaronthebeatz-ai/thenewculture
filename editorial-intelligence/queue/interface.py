"""EventQueue — where scored, deduplicated Events wait for an editor.

No database (section II/IV). This is an interface specifically so a
future phase can swap in a persistent implementation (e.g. a JSON file,
or eventually a real database) without collector/pipeline.py or
prompt/generator.py changing at all — they depend on this abstraction,
never on a concrete storage technology (Dependency Inversion, section
XIV).
"""
from abc import ABC, abstractmethod
from typing import List, Optional

from ..models.enums import EventStatus
from ..models.event import EditorialEvent


class EventQueue(ABC):
    @abstractmethod
    def push(self, event: EditorialEvent) -> None:
        raise NotImplementedError

    @abstractmethod
    def get(self, event_id: str) -> Optional[EditorialEvent]:
        raise NotImplementedError

    @abstractmethod
    def all(self) -> List[EditorialEvent]:
        raise NotImplementedError

    @abstractmethod
    def update_status(self, event_id: str, status: EventStatus) -> None:
        raise NotImplementedError

    def list_by_status(self, status: EventStatus) -> List[EditorialEvent]:
        """Concrete convenience built on top of all() — subclasses get
        this for free and only need to implement the four primitives
        above."""
        return [e for e in self.all() if e.status == status]

    def list_pending_review(self) -> List[EditorialEvent]:
        return self.list_by_status(EventStatus.PENDING_REVIEW)
