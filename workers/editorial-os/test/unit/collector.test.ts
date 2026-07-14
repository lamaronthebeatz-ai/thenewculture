import { describe, expect, it } from "vitest";
import { CollectorPipeline } from "../../src/collector";
import { EventStatus } from "../../src/models";
import { NewsProvider, ProviderRegistry } from "../../src/providers";
import { InMemoryEventQueue } from "../../src/queue";

describe("CollectorPipeline", () => {
  it("runs every registered provider and scores/maps/queues each event", async () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider());
    const queue = new InMemoryEventQueue();
    const pipeline = new CollectorPipeline(registry, queue);

    const newEvents = await pipeline.run();

    expect(newEvents).toHaveLength(3);
    expect(queue.count()).toBe(3);
    for (const event of queue.all()) {
      expect(event.mappingResult).not.toBeNull();
      expect([EventStatus.PENDING_REVIEW, EventStatus.LOW_CONFIDENCE]).toContain(event.status);
    }
  });

  it("returns [] newly-added when a provider produces nothing", async () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider([]));
    const queue = new InMemoryEventQueue();
    const pipeline = new CollectorPipeline(registry, queue);
    expect(await pipeline.run()).toEqual([]);
  });
});
