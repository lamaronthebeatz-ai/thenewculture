import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { SourceConfig } from "../../../src/collectors/base";
import { extractYoutubeVideoId, fetchYoutubeFeed } from "../../../src/collectors/youtube";

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "test-yt",
    name: "Test YouTube Channel",
    type: "youtube",
    feed: "https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123",
    tier: SourceTier.TIER_1,
    enabled: true,
    timeoutMs: 5000,
    retry: 0,
    defaultArtist: "Test Artist",
    ...overrides,
  };
}

const YOUTUBE_ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>Test Artist - Uploads</title>
  <entry>
    <id>yt:video:abcDEF123</id>
    <yt:videoId>abcDEF123</yt:videoId>
    <title>Test Artist - Official MV</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abcDEF123"/>
    <author><name>Test Artist</name></author>
    <published>2026-01-18T10:00:00+00:00</published>
    <updated>2026-01-18T10:05:00+00:00</updated>
    <media:group>
      <media:title>Test Artist - Official MV</media:title>
      <media:thumbnail url="https://i.ytimg.com/vi/abcDEF123/hqdefault.jpg" width="480" height="360"/>
      <media:description>Official music video.</media:description>
    </media:group>
  </entry>
</feed>`;

describe("extractYoutubeVideoId", () => {
  it("extracts the v= query param", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=abcDEF123")).toBe("abcDEF123");
  });

  it("returns null when there's no v= param", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/channel/UCabc")).toBeNull();
  });
});

describe("fetchYoutubeFeed", () => {
  it("parses a YouTube channel Atom feed into RawNewsItem[]", async () => {
    const fetchImpl = (async () =>
      new Response(YOUTUBE_ATOM_FIXTURE, { status: 200 })) as unknown as typeof fetch;
    const result = await fetchYoutubeFeed(makeSource(), fetchImpl);

    expect(result.status).toBe("healthy");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Test Artist - Official MV");
    expect(result.items[0]!.url).toBe("https://www.youtube.com/watch?v=abcDEF123");
    expect(result.items[0]!.thumbnail).toBe("https://i.ytimg.com/vi/abcDEF123/hqdefault.jpg");
    expect(result.items[0]!.publishedAt).toBe("2026-01-18T10:00:00.000Z"); // normalized to ISO 8601
  });

  it("rewrites canonicalUrl to a stable youtube:<id> form", async () => {
    const fetchImpl = (async () =>
      new Response(YOUTUBE_ATOM_FIXTURE, { status: 200 })) as unknown as typeof fetch;
    const result = await fetchYoutubeFeed(makeSource(), fetchImpl);
    expect(result.items[0]!.canonicalUrl).toBe("youtube:abcDEF123");
  });

  it("propagates non-healthy statuses unchanged (no video-id rewrite attempted)", async () => {
    const fetchImpl = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const result = await fetchYoutubeFeed(makeSource({ retry: 0 }), fetchImpl);
    expect(result.status).toBe("http_404");
    expect(result.items).toEqual([]);
  });
});
