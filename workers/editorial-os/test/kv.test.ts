/**
 * KV tests — exercise src/kv.ts against the real Miniflare KV binding
 * the Workers test pool provides (see vitest.config.ts's
 * `miniflare.kvNamespaces`), not a hand-rolled mock.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createEvent, EventType, makeStoryCandidate, StoryType } from "../src/models";
import { EditorialKvStore } from "../src/kv";
import { makeArticle } from "../src/workspace";

describe("EditorialKvStore", () => {
  it("getQueue/getHistory/getWorkerStatus return [] and getDashboard/getMetrics return null before anything is written", async () => {
    const store = new EditorialKvStore(env.EDITORIAL_KV);
    expect(await store.getQueue()).toEqual([]);
    expect(await store.getHistory()).toEqual([]);
    expect(await store.getWorkerStatus()).toEqual([]);
    expect(await store.getDashboard()).toBeNull();
    expect(await store.getMetrics()).toBeNull();
  });

  it("putQueue/getQueue round-trips a StoryCandidate list", async () => {
    const store = new EditorialKvStore(env.EDITORIAL_KV);
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    const story = makeStoryCandidate(event, StoryType.RELEASE);
    story.priorityScore = 42;

    await store.putQueue([story]);
    const loaded = await store.getQueue();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.priorityScore).toBe(42);
    expect(loaded[0]!.event.title).toBe("T");
  });

  it("putHistory/getHistory round-trips an Article list including its History timeline", async () => {
    const store = new EditorialKvStore(env.EDITORIAL_KV);
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    const article = makeArticle(makeStoryCandidate(event, StoryType.RELEASE));
    article.history.push({ label: "Created", status: "new", timestamp: "2026-01-01T00:00:00Z", note: null });

    await store.putHistory([article]);
    const loaded = await store.getHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.history).toEqual(article.history);
  });

  it("putDashboard/getDashboard and putMetrics/getMetrics round-trip", async () => {
    const store = new EditorialKvStore(env.EDITORIAL_KV);
    const dashboard = {
      pending: 1, ready: 0, writing: 0, review: 0, published: 0,
      coverStory: null, topStory: null, issuePlanning: [], seriesBalance: {},
      averageConfidence: null, averagePriority: null,
    };
    await store.putDashboard(dashboard);
    expect(await store.getDashboard()).toEqual(dashboard);

    const metrics = {
      pending: 1, writing: 0, review: 0, published: 0,
      averageWritingTimeHours: null, averageReviewTimeHours: null,
      seriesDistribution: {}, storyTypeDistribution: {},
    };
    await store.putMetrics(metrics);
    expect(await store.getMetrics()).toEqual(metrics);
  });

  it("putWorkerStatus/getWorkerStatus round-trips a RunLog list", async () => {
    const store = new EditorialKvStore(env.EDITORIAL_KV);
    const run = { runId: "abc", startedAt: "2026-01-01T00:00:00Z", finishedAt: "2026-01-01T00:00:01Z", durationSeconds: 1, eventsProcessed: 3, errors: [], messages: [] };
    await store.putWorkerStatus([run]);
    expect(await store.getWorkerStatus()).toEqual([run]);
  });
});
