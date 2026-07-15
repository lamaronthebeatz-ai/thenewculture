import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { SourceConfig } from "../../../src/collectors/base";
import { fetchRssFeed, parseFeedXml } from "../../../src/collectors/rss";

function makeSource(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    id: "test-rss",
    name: "Test RSS Source",
    type: "rss",
    category: "international",
    url: "https://example.com/feed.xml",
    notes: "",
    tier: SourceTier.TIER_2,
    enabled: true,
    timeoutMs: 5000,
    retry: 0,
    ...overrides,
  };
}

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title><![CDATA[HIEUTHUHAI ra mắt album mới]]></title>
      <link>https://example.com/articles/1</link>
      <description><![CDATA[Album phòng thu thứ hai &amp; tour quảng bá.]]></description>
      <pubDate>Mon, 20 Jan 2026 09:00:00 GMT</pubDate>
      <author>editor@example.com (Editor Name)</author>
      <category>Album</category>
      <enclosure url="https://example.com/img/1.jpg" type="image/jpeg"/>
    </item>
    <item>
      <title>Second story with no CDATA</title>
      <link>https://example.com/articles/2</link>
      <description>Plain description text.</description>
      <pubDate>Tue, 21 Jan 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <entry>
    <title>Atom Story One</title>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <summary>Atom summary text.</summary>
    <published>2026-01-20T09:00:00Z</published>
    <author><name>Atom Author</name></author>
    <category term="Interview"/>
  </entry>
</feed>`;

describe("parseFeedXml", () => {
  it("parses RSS 2.0 <item> blocks including CDATA and entities", () => {
    const items = parseFeedXml(RSS_FIXTURE, makeSource());
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe("HIEUTHUHAI ra mắt album mới");
    expect(items[0]!.summary).toBe("Album phòng thu thứ hai & tour quảng bá.");
    expect(items[0]!.url).toBe("https://example.com/articles/1");
    expect(items[0]!.publishedAt).toBe("2026-01-20T09:00:00.000Z"); // RFC 822 pubDate normalized to ISO 8601
    expect(items[0]!.author).toContain("Editor Name");
    expect(items[0]!.category).toBe("Album");
    expect(items[0]!.thumbnail).toBe("https://example.com/img/1.jpg");
    expect(items[0]!.sourceId).toBe("test-rss");
  });

  it("parses Atom <entry> blocks (rel=alternate link, <author><name>)", () => {
    const items = parseFeedXml(ATOM_FIXTURE, makeSource({ type: "atom" }));
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("Atom Story One");
    expect(items[0]!.url).toBe("https://example.com/atom/1");
    expect(items[0]!.publishedAt).toBe("2026-01-20T09:00:00.000Z");
    expect(items[0]!.author).toBe("Atom Author");
    expect(items[0]!.category).toBe("Interview");
  });

  it("returns [] for a well-formed but empty feed", () => {
    const empty = `<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    expect(parseFeedXml(empty, makeSource())).toEqual([]);
  });

  it("throws for content that is neither RSS nor Atom", () => {
    expect(() => parseFeedXml("<html><body>not a feed</body></html>", makeSource())).toThrow();
  });

  it("skips a block missing a required field (title or url)", () => {
    const partial = `<rss><channel><item><title>No link here</title></item></channel></rss>`;
    expect(parseFeedXml(partial, makeSource())).toEqual([]);
  });
});

describe("fetchRssFeed", () => {
  it("returns not_configured with no network call when url is null, regardless of enabled", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(RSS_FIXTURE, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchRssFeed(makeSource({ url: null, enabled: true }), fetchImpl);
    expect(calls).toBe(0);
    expect(result).toMatchObject({ status: "not_configured", items: [], responseTimeMs: null, retryCount: 0, errorMessage: null });
  });

  it("returns status healthy with parsed items on a 200 response", async () => {
    const fetchImpl = (async () =>
      new Response(RSS_FIXTURE, { status: 200 })) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource(), fetchImpl);
    expect(result.status).toBe("healthy");
    expect(result.items).toHaveLength(2);
    expect(result.responseTimeMs).not.toBeNull();
    expect(result.retryCount).toBe(0);
  });

  it("classifies a 404 response as http_404", async () => {
    const fetchImpl = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource({ retry: 0 }), fetchImpl);
    expect(result.status).toBe("http_404");
    expect(result.items).toEqual([]);
  });

  it("classifies a non-404 error status as http_error", async () => {
    const fetchImpl = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource({ retry: 0 }), fetchImpl);
    expect(result.status).toBe("http_error");
  });

  it("classifies invalid content as parsing_error", async () => {
    const fetchImpl = (async () => new Response("<html>not a feed</html>", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource({ retry: 0 }), fetchImpl);
    expect(result.status).toBe("parsing_error");
  });

  it("classifies an aborted (timed out) fetch as timeout", async () => {
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource({ timeoutMs: 5, retry: 0 }), fetchImpl);
    expect(result.status).toBe("timeout");
  });

  it("retries up to `retry` times and counts retryCount", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls < 3) return new Response("", { status: 500 });
      return new Response(RSS_FIXTURE, { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchRssFeed(makeSource({ retry: 2 }), fetchImpl);
    expect(result.status).toBe("healthy");
    expect(calls).toBe(3);
    expect(result.retryCount).toBe(2);
  });
});
