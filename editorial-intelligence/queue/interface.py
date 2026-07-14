"""EventQueue — where scored, deduplicated Events wait for an editor.

No database (section II/IV). This is an interface specifically so a
future phase can swap in a persistent implementation (e.g. a JSON file,
or eventually a real database) without collector/pipeline.py or
prompt/generator.py changing at all — they depend on this abstraction,
never on a concrete storage technology (Dependency Inversion, section
XIV).

Phase 1 shipped push/get/all/update_status (the review-queue shape
CollectorPipeline actually uses) plus list_by_status/list_pending_review
built on top. Phase 2 (section VII) asks for the classic FIFO verbs —
enqueue/dequeue/peek/list/count/clear — implemented below as additional
concrete methods reusing the same primitives, plus one new abstract
primitive (`remove`) since FIFO dequeue/clear need an operation Phase 1
never required: removing an entry. None of the four original abstract
methods changed name, signature, or behavior.
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
        """Must preserve insertion order (oldest first) — list()/peek()/
        dequeue() below rely on this for FIFO semantics."""
        raise NotImplementedError

    @abstractmethod
    def update_status(self, event_id: str, status: EventStatus) -> None:
        raise NotImplementedError

    @abstractmethod
    def remove(self, event_id: str) -> Optional[EditorialEvent]:
        """Phase 2 addition: removes and returns the event, or None if no
        event with that id is present. The one new capability
        dequeue()/clear() need that push/get/all/update_status alone
        can't provide."""
        raise NotImplementedError

    def list_by_status(self, status: EventStatus) -> List[EditorialEvent]:
        """Concrete convenience built on top of all() — subclasses get
        this for free and only need to implement the primitives above."""
        return [e for e in self.all() if e.status == status]

    def list_pending_review(self) -> List[EditorialEvent]:
        return self.list_by_status(EventStatus.PENDING_REVIEW)

    # --- Phase 2, section VII: classic FIFO queue verbs, all built on
    # the primitives above (no duplicate storage/bookkeeping logic). ---

    def enqueue(self, event: EditorialEvent) -> None:
        """Same operation as push() — section VII asks for this exact
        name; reuses push() rather than re-implementing storage."""
        self.push(event)

    def peek(self) -> Optional[EditorialEvent]:
        """Oldest event still present, without removing it. None if
        empty."""
        items = self.all()
        return items[0] if items else None

    def dequeue(self) -> Optional[EditorialEvent]:
        """Removes and returns the oldest event. None if empty."""
        oldest = self.peek()
        if oldest is None:
            return None
        return self.remove(oldest.id)

    def list(self) -> List[EditorialEvent]:
        """Alias for all() — section VII names it `list()`; kept
        separate from all() only because that is Phase 1's established
        name and this is Phase 2's, not because they behave differently."""
        return self.all()

    def count(self) -> int:
        return len(self.all())

    def clear(self) -> None:
        for event in list(self.all()):
            self.remove(event.id)
