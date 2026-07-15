/**
 * Phase 8 (News Intelligence Collector) regression + end-to-end check.
 *
 * 1. Backward compatibility: with today's real, shipped `SOURCE_CONFIG`
 *    (empty — see src/collectors/sources.ts), `runWorkerOnce()` must
 *    behave byte-for-byte like it did before this feature existed —
 *    same 3 bundled fixture events, same dashboard fields, same KV
 *    keys — with the *only* addition being a zeroed-out `newsCollector`
 *    stats block on the dashboard.
 * 2. End-to-end: with a real (injected) RSS source, a collected item
 *    flows all the way through dedupe/scoring/threshold/sort into the
 *    same `queue`/`history`/`dashboard` KV keys the fixture path uses,
 *    proving the `WorkerRunnerOptions.fixtures` seam actually works
 *    against the real KV-backed store, not just in-memory unit tests.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SourceTier } from "../../src/models";
import { EditorialKvStore } from "../../src/kv";
import { runWorkerOnce, EnrichedWorkerDashboard } from "../../src/service";
import { SOURCE_CONFIG } from "../../src/collectors/sources";
import { SourceConfig } from "../../src/collectors/base";

describe("Phase 8 backward compatibility (real, shipped SOURCE_CONFIG)", () => {
  it("is empty today, so runWorkerOnce falls back to the 3 bundled fixtures unchanged", async () => {
    expect(SOURCE_CONFIG).toEqual([]);

    const result = await runWorkerOnce(env.EDITORIAL_KV);
    expect(result.ran).toBe(true);
    expect(result.stories).toHaveLength(3);
    expect(result.articles).toHaveLength(3);

    const store = new EditorialKvStore(env.EDITORIAL_KV);
    expect(await store.getQueue()).toHaveLength(3);
    expect(await store.getHistory()).toHaveLength(3);

    const dashboard = (await store.getDashboard()) as EnrichedWorkerDashboard;
    expect(dashboard.coverStory).toBe("Album Vọng Âm Ra Mắt");
    expect(dashboard.topStory).toBe("Album Vọng Âm Ra Mắt");
    expect(dashboard.ready).toBe(1);
    expect(dashboard.pending).toBe(3);
    // The one net-new field: present, but zeroed out since there are no
    // sources configured to collect from.
    expect(dashboard.newsCollector).toEqual({
      collectorHealth: [],
      collected: 0,
      accepted: 0,
      rejected: 0,
      duplicatesRemoved: 0,
      topStory: null,
      newestStory: null,
      lastCrawlAt: dashboard.newsCollector.lastCrawlAt,
    });
  });
});

describe("Phase 8 end-to-end with an injected real-shaped RSS source", () => {
  it("collects, dedupes, scores, and flows a fresh story into queue/history/dashboard", async () => {
    const feedUrl = "https://example.com/e2e-feed.xml";
    const source: SourceConfig = {
      id: "e2e-source",
      name: "E2E Source",
      type: "rss",
      feed: feedUrl,
      tier: SourceTier.TIER_1,
      enabled: true,
      timeoutMs: 5000,
      retry: 0,
      defaultArtist: "E2E Artist",
    };

    const now = new Date();
    const xml = `<rss><channel><item>
      <title>E2E Artist ra mắt album mới</title>
      <link>https://example.com/e2e-story</link>
      <description>desc</description>
      <pubDate>${now.toUTCString()}</pubDate>
    </item></channel></rss>`;

    const fetchImpl = (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;

    const result = await runWorkerOnce(env.EDITORIAL_KV, [source], fetchImpl);
    expect(result.ran).toBe(true);
    // 1 real collected story + the 3 bundled fixtures are NOT both
    // present at once: injecting `sources` replaces WorkerRunner's
    // fixtures entirely (see service.ts), so exactly the 1 collected,
    // above-threshold story flows through.
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0]!.event.title).toBe("E2E Artist ra mắt album mới");
    expect(result.stories[0]!.event.artist).toBe("E2E Artist");

    const store = new EditorialKvStore(env.EDITORIAL_KV);
    const queue = await store.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.event.title).toBe("E2E Artist ra mắt album mới");

    const dashboard = (await store.getDashboard()) as EnrichedWorkerDashboard;
    expect(dashboard.newsCollector.collected).toBe(1);
    expect(dashboard.newsCollector.accepted).toBe(1);
    expect(dashboard.newsCollector.rejected).toBe(0);
    expect(dashboard.newsCollector.topStory?.title).toBe("E2E Artist ra mắt album mới");
    expect(dashboard.newsCollector.collectorHealth).toEqual([
      expect.objectContaining({ sourceId: "e2e-source", status: "healthy", itemsCollected: 1 }),
    ]);
  });
});
