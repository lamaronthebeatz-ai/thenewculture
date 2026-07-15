/**
 * Phase 8 (News Intelligence Collector) + PR #41 (Registry Runtime
 * Integration) regression + end-to-end check.
 *
 * 1. Backward compatibility: with today's real, shipped
 *    editorial-config/sources.yaml (PR #40, ~20 named sources, but
 *    every one has both `rss`/`youtube` null — no feed could be
 *    verified from this environment), `runWorkerOnce()` must still
 *    behave byte-for-byte like it did before this feature existed —
 *    same 3 bundled fixture events, same dashboard fields, same KV
 *    keys. Per src/config-loader/factory.ts's design ("rss == null ->
 *    Ignore RSS Collector" / "youtube == null -> Ignore YouTube
 *    Collector" means no SourceConfig row is produced at all for a
 *    null feed field), zero real collectors are ever instantiated
 *    today, so Collector Health is empty too — this is the "runtime
 *    must continue normally even if every source is NOT_CONFIGURED"
 *    requirement, proven end-to-end.
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
import { SourceConfig } from "../../src/collectors/base";
import { loadSourceConfigFromYaml } from "../../src/config-loader/factory";
import { EMBEDDED_SOURCES_YAML } from "../../src/config-loader/embeddedSourcesYaml.generated";

describe("Phase 8 backward compatibility (real, shipped editorial-config/sources.yaml)", () => {
  it("every registry entry has rss/youtube: null today, so runWorkerOnce still falls back to the 3 bundled fixtures unchanged", async () => {
    const { sources: loadedSources, configErrors } = loadSourceConfigFromYaml(EMBEDDED_SOURCES_YAML);
    expect(configErrors).toEqual([]); // today's real file is fully schema-valid
    expect(loadedSources).toEqual([]); // every row has both rss/youtube null -> zero collectors

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
    // Zero real news collected/accepted, zero collector-health entries
    // (nothing was ever configured to run) — but the run itself
    // proceeds and populates KV exactly as it always has.
    expect(dashboard.newsCollector.collected).toBe(0);
    expect(dashboard.newsCollector.accepted).toBe(0);
    expect(dashboard.newsCollector.rejected).toBe(0);
    expect(dashboard.newsCollector.topStory).toBeNull();
    expect(dashboard.newsCollector.newestStory).toBeNull();
    expect(dashboard.newsCollector.collectorHealth).toEqual([]);
  });
});

describe("Phase 8 end-to-end with an injected real-shaped RSS source", () => {
  it("collects, dedupes, scores, and flows a fresh story into queue/history/dashboard", async () => {
    const feedUrl = "https://example.com/e2e-feed.xml";
    const source: SourceConfig = {
      id: "e2e-source",
      name: "E2E Source",
      type: "rss",
      category: "international",
      url: feedUrl,
      notes: "",
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
