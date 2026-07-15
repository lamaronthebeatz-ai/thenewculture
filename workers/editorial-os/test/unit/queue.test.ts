import { describe, expect, it } from "vitest";
import { createEvent, EventStatus, EventType } from "../../src/models";
import { InMemoryEventQueue } from "../../src/queue";

async function makeEvent(title: string) {
  return createEvent({ title, artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
}

describe("InMemoryEventQueue", () => {
  it("push/get/all round-trip", async () => {
    const queue = new InMemoryEventQueue();
    const e = await makeEvent("T");
    queue.push(e);
    expect(queue.get(e.id)).toBe(e);
    expect(queue.all()).toEqual([e]);
  });

  it("preserves insertion order (FIFO)", async () => {
    const queue = new InMemoryEventQueue();
    const a = await makeEvent("A");
    const b = await makeEvent("B");
    queue.push(a);
    queue.push(b);
    expect(queue.all().map((e) => e.title)).toEqual(["A", "B"]);
  });

  it("updateStatus mutates the stored event", async () => {
    const queue = new InMemoryEventQueue();
    const e = await makeEvent("T");
    queue.push(e);
    queue.updateStatus(e.id, EventStatus.REJECTED);
    expect(queue.get(e.id)?.status).toBe(EventStatus.REJECTED);
  });

  it("enqueue/peek/dequeue/list/count/clear (Phase 2 FIFO verbs)", async () => {
    const queue = new InMemoryEventQueue();
    const a = await makeEvent("A");
    const b = await makeEvent("B");
    queue.enqueue(a);
    queue.enqueue(b);

    expect(queue.count()).toBe(2);
    expect(queue.peek()?.title).toBe("A");
    expect(queue.count()).toBe(2); // peek does not remove

    const dequeued = queue.dequeue();
    expect(dequeued?.title).toBe("A");
    expect(queue.list().map((e) => e.title)).toEqual(["B"]);

    queue.clear();
    expect(queue.count()).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });

  it("listPendingReview filters by status", async () => {
    const queue = new InMemoryEventQueue();
    const a = await makeEvent("A");
    a.status = EventStatus.PENDING_REVIEW;
    const b = await makeEvent("B");
    b.status = EventStatus.LOW_CONFIDENCE;
    queue.push(a);
    queue.push(b);
    expect(queue.listPendingReview().map((e) => e.title)).toEqual(["A"]);
  });
});
