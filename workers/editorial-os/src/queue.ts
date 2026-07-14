/**
 * Queue — 1:1 port of editorial-intelligence/queue/{interface,in_memory}.py.
 *
 * Still no database, matching Phase 1/2's "Không implement database" —
 * InMemoryEventQueue lives only for the lifetime of one Worker
 * invocation. Cross-invocation persistence (what Python's Phase 4 CLI
 * did with a local JSON file) is KV's job here (see kv.ts) — the queue
 * *implementation* itself is unchanged, only what wraps it between runs
 * differs by runtime, exactly the same split Python's CLI already used
 * for StoryCandidate/Article persistence.
 */
import { EditorialEvent, EventStatus } from "./models";

export interface EventQueue {
  push(event: EditorialEvent): void;
  get(eventId: string): EditorialEvent | undefined;
  all(): EditorialEvent[];
  updateStatus(eventId: string, status: EventStatus): void;
  remove(eventId: string): EditorialEvent | undefined;

  listByStatus(status: EventStatus): EditorialEvent[];
  listPendingReview(): EditorialEvent[];
  enqueue(event: EditorialEvent): void;
  peek(): EditorialEvent | undefined;
  dequeue(): EditorialEvent | undefined;
  list(): EditorialEvent[];
  count(): number;
  clear(): void;
}

abstract class BaseEventQueue implements EventQueue {
  abstract push(event: EditorialEvent): void;
  abstract get(eventId: string): EditorialEvent | undefined;
  abstract all(): EditorialEvent[];
  abstract updateStatus(eventId: string, status: EventStatus): void;
  abstract remove(eventId: string): EditorialEvent | undefined;

  listByStatus(status: EventStatus): EditorialEvent[] {
    return this.all().filter((e) => e.status === status);
  }

  listPendingReview(): EditorialEvent[] {
    return this.listByStatus(EventStatus.PENDING_REVIEW);
  }

  enqueue(event: EditorialEvent): void {
    this.push(event);
  }

  peek(): EditorialEvent | undefined {
    const items = this.all();
    return items[0];
  }

  dequeue(): EditorialEvent | undefined {
    const oldest = this.peek();
    if (oldest === undefined) return undefined;
    return this.remove(oldest.id);
  }

  list(): EditorialEvent[] {
    return this.all();
  }

  count(): number {
    return this.all().length;
  }

  clear(): void {
    for (const event of [...this.all()]) {
      this.remove(event.id);
    }
  }
}

export class InMemoryEventQueue extends BaseEventQueue {
  private events = new Map<string, EditorialEvent>();

  push(event: EditorialEvent): void {
    this.events.set(event.id, event);
  }

  get(eventId: string): EditorialEvent | undefined {
    return this.events.get(eventId);
  }

  all(): EditorialEvent[] {
    return [...this.events.values()];
  }

  updateStatus(eventId: string, status: EventStatus): void {
    const event = this.events.get(eventId);
    if (event !== undefined) event.status = status;
  }

  remove(eventId: string): EditorialEvent | undefined {
    const event = this.events.get(eventId);
    this.events.delete(eventId);
    return event;
  }
}
