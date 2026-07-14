"""Section VII: enqueue/dequeue/peek/list/count/clear, memory only."""
from editorial_intelligence.models.enums import EventStatus, EventType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.queue.in_memory import InMemoryEventQueue


def _event(title):
    return EditorialEvent.create(
        title=title, artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )


def test_empty_queue():
    q = InMemoryEventQueue()
    assert q.count() == 0
    assert q.list() == []
    assert q.peek() is None
    assert q.dequeue() is None


def test_enqueue_is_push():
    q = InMemoryEventQueue()
    e = _event("A")
    q.enqueue(e)
    assert q.get(e.id) is e
    assert q.count() == 1


def test_peek_does_not_remove():
    q = InMemoryEventQueue()
    e = _event("A")
    q.enqueue(e)
    assert q.peek() is e
    assert q.count() == 1  # still there


def test_dequeue_removes_oldest_first_fifo_order():
    q = InMemoryEventQueue()
    a, b, c = _event("A"), _event("B"), _event("C")
    q.enqueue(a)
    q.enqueue(b)
    q.enqueue(c)

    assert q.dequeue() is a
    assert q.dequeue() is b
    assert q.count() == 1
    assert q.dequeue() is c
    assert q.dequeue() is None


def test_list_is_all_in_insertion_order():
    q = InMemoryEventQueue()
    a, b = _event("A"), _event("B")
    q.enqueue(a)
    q.enqueue(b)
    assert q.list() == [a, b] == q.all()


def test_count():
    q = InMemoryEventQueue()
    q.enqueue(_event("A"))
    q.enqueue(_event("B"))
    assert q.count() == 2


def test_clear_empties_queue():
    q = InMemoryEventQueue()
    q.enqueue(_event("A"))
    q.enqueue(_event("B"))
    q.clear()
    assert q.count() == 0
    assert q.list() == []


def test_repush_same_id_keeps_original_fifo_position():
    q = InMemoryEventQueue()
    a, b = _event("A"), _event("B")
    q.enqueue(a)
    q.enqueue(b)
    a.status = EventStatus.PENDING_REVIEW
    q.push(a)  # re-push same id (e.g. after a merge) — must not move to back
    assert q.list() == [a, b]


def test_remove_returns_none_for_missing_id():
    q = InMemoryEventQueue()
    assert q.remove("does-not-exist") is None


def test_update_status_still_works_unchanged():
    q = InMemoryEventQueue()
    e = _event("A")
    q.push(e)
    q.update_status(e.id, EventStatus.REJECTED)
    assert q.get(e.id).status == EventStatus.REJECTED
