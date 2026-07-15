import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { newsIntelligenceWeights } from "../../../src/config";
import { SourceConfig } from "../../../src/collectors/base";
import { collectAllNews } from "../../../src/collectors/registry";

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "s1",
    name: "Source One",
    type: "rss",
    feed: "https://example.com/feed.xml",
    tier: SourceTier.TIER_1,
    enabled: true,
    timeoutMs: 5000,
    retry: 0,
    ...overrides,
  };
}

function rssXmlWithOneFreshItem(title: string, publishedAt: string, link = "https://example.com/x"): string {
  return `<rss><channel><item><title>${title}</title><link>${link}</link><description>desc</description><pubDate>${publishedAt}</pubDate></item></channel></rss>`;
}

const NOW = new Date("2026-01-20T09:00:00Z");

describe("collectAllNews", () => {
  it("returns all-empty/zero stats when given zero sources (no network call)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await collectAllNews([], fetchImpl, NOW);
    expect(calls).toBe(0);
    expect(result).toMatchObject({ collected: 0, accepted: 0, rejected: 0, duplicatesRemoved: 0, topStory: null, newestStory: null, payloads: [], health: [] });
  });

  it("skips disabled sources entirely (no fetch call, reported as disabled)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(rssXmlWithOneFreshItem("T", NOW.toUTCString()), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await collectAllNews([makeSource({ enabled: false })], fetchImpl, NOW);
    expect(calls).toBe(0);
    expect(result.health).toEqual([
      { sourceId: "s1", sourceName: "Source One", status: "disabled", lastSuccess: null, lastFailure: null, responseTimeMs: null, itemsCollected: 0, retryCount: 0 },
    ]);
  });

  it("collects a fresh, high-tier item, scores it above threshold, and converts it into a RawPayload", async () => {
    const fetchImpl = (async () =>
      new Response(rssXmlWithOneFreshItem("HIEUTHUHAI ra mắt album mới", NOW.toUTCString()), { status: 200 })) as unknown as typeof fetch;

    const result = await collectAllNews([makeSource({ defaultArtist: "HIEUTHUHAI" })], fetchImpl, NOW);
    expect(result.collected).toBe(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.payloads).toHaveLength(1);
    expect(result.payloads[0]).toMatchObject({ title: "HIEUTHUHAI ra mắt album mới", artist: "HIEUTHUHAI", event_type: "album_release" });
    expect(result.topStory?.title).toBe("HIEUTHUHAI ra mắt album mới");
    expect(result.newestStory?.title).toBe("HIEUTHUHAI ra mắt album mới");
  });

  it("rejects a stale, low-tier item that scores below the entry threshold", async () => {
    const staleDate = new Date(NOW.getTime() - newsIntelligenceWeights.freshnessWindowHours * 5 * 3600 * 1000);
    const fetchImpl = (async () =>
      new Response(rssXmlWithOneFreshItem("Old low-tier story", staleDate.toUTCString()), { status: 200 })) as unknown as typeof fetch;

    const result = await collectAllNews([makeSource({ tier: SourceTier.TIER_3 })], fetchImpl, NOW);
    expect(result.collected).toBe(1);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.payloads).toEqual([]);
    expect(result.topStory).toBeNull();
  });

  it("dedupes across two sources reporting the same url, keeping the higher tier", async () => {
    const sourceA = makeSource({ id: "a", name: "Source A", tier: SourceTier.TIER_3, feed: "https://a.example.com/feed.xml" });
    const sourceB = makeSource({ id: "b", name: "Source B", tier: SourceTier.TIER_1, feed: "https://b.example.com/feed.xml" });

    const fetchImpl = (async (url: string) => {
      const xml = rssXmlWithOneFreshItem("Cùng một tin", NOW.toUTCString(), "https://shared.example.com/story");
      return new Response(xml, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await collectAllNews([sourceA, sourceB], fetchImpl, NOW);
    expect(result.collected).toBe(2);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.payloads).toHaveLength(1);
    expect(result.payloads[0]).toMatchObject({ artist: "Source B" }); // kept the tier_1 source's attribution
  });

  it("sorts accepted stories by EditorialScore DESC, then publishedAt DESC", async () => {
    const sourceA = makeSource({ id: "a", feed: "https://a.example.com/feed.xml", tier: SourceTier.TIER_3 });
    const sourceB = makeSource({ id: "b", feed: "https://b.example.com/feed.xml", tier: SourceTier.TIER_1 });

    const fetchImpl = (async (url: string) => {
      if (String(url).includes("a.example.com")) {
        return new Response(rssXmlWithOneFreshItem("Low tier story", NOW.toUTCString(), "https://a.example.com/1"), { status: 200 });
      }
      return new Response(rssXmlWithOneFreshItem("High tier story", NOW.toUTCString(), "https://b.example.com/1"), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await collectAllNews([sourceA, sourceB], fetchImpl, NOW);
    expect(result.payloads.map((p) => p["title"])).toEqual(["High tier story", "Low tier story"]);
  });
});
