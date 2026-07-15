import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { CollectorFetchResult, SourceConfig } from "../../../src/collectors/base";
import { CollectorHealthTracker } from "../../../src/collectors/health";

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "s1",
    name: "Source One",
    type: "rss",
    feed: "https://example.com/feed.xml",
    tier: SourceTier.TIER_2,
    enabled: true,
    timeoutMs: 5000,
    retry: 1,
    ...overrides,
  };
}

const NOW = "2026-01-20T09:00:00.000Z";

describe("CollectorHealthTracker.build", () => {
  it("reports a disabled source as disabled without needing a fetch result", () => {
    const tracker = new CollectorHealthTracker();
    const entries = tracker.build([makeSource({ enabled: false })], new Map(), NOW);
    expect(entries).toEqual([
      { sourceId: "s1", sourceName: "Source One", status: "disabled", lastSuccess: null, lastFailure: null, responseTimeMs: null, itemsCollected: 0, retryCount: 0 },
    ]);
  });

  it("reports a healthy source with lastSuccess set and lastFailure null", () => {
    const tracker = new CollectorHealthTracker();
    const result: CollectorFetchResult = {
      sourceId: "s1", sourceName: "Source One", status: "healthy", items: [{} as never, {} as never], responseTimeMs: 120, retryCount: 0, errorMessage: null,
    };
    const entries = tracker.build([makeSource()], new Map([["s1", result]]), NOW);
    expect(entries[0]).toMatchObject({ status: "healthy", lastSuccess: NOW, lastFailure: null, responseTimeMs: 120, itemsCollected: 2, retryCount: 0 });
  });

  it("reports a failed source with lastFailure set and lastSuccess null", () => {
    const tracker = new CollectorHealthTracker();
    const result: CollectorFetchResult = {
      sourceId: "s1", sourceName: "Source One", status: "timeout", items: [], responseTimeMs: null, retryCount: 1, errorMessage: "timed out",
    };
    const entries = tracker.build([makeSource()], new Map([["s1", result]]), NOW);
    expect(entries[0]).toMatchObject({ status: "timeout", lastSuccess: null, lastFailure: NOW, itemsCollected: 0, retryCount: 1 });
  });

  it("falls back to http_error with lastFailure when an enabled source has no result at all", () => {
    const tracker = new CollectorHealthTracker();
    const entries = tracker.build([makeSource()], new Map(), NOW);
    expect(entries[0]).toMatchObject({ status: "http_error", lastFailure: NOW, lastSuccess: null });
  });

  it("builds one entry per configured source, preserving order", () => {
    const tracker = new CollectorHealthTracker();
    const sources = [makeSource({ id: "a" }), makeSource({ id: "b", enabled: false }), makeSource({ id: "c" })];
    const entries = tracker.build(sources, new Map(), NOW);
    expect(entries.map((e) => e.sourceId)).toEqual(["a", "b", "c"]);
  });
});
