import { describe, expect, it } from "vitest";
import { detectSource } from "../../../src/source-manager/detection";

function fetchImplReturning(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("detectSource", () => {
  it("detects a direct /channel/UC... YouTube URL without needing a fetch", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await detectSource("https://www.youtube.com/channel/UCabcDEF1234567890ab", fetchImpl);
    expect(calls).toBe(0);
    expect(result).toMatchObject({
      feedType: "youtube",
      valid: true,
      youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcDEF1234567890ab",
    });
  });

  it("resolves a /@handle YouTube URL by fetching the page for its embedded channel id", async () => {
    const html = `<html><script>var x = {"channelId":"UC1234567890abcdefghij"}</script></html>`;
    const result = await detectSource("https://www.youtube.com/@SomeArtist", fetchImplReturning(200, html));
    expect(result).toMatchObject({ feedType: "youtube", valid: true, youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890abcdefghij" });
  });

  it("falls back to manual when a YouTube handle URL can't be resolved", async () => {
    const result = await detectSource("https://www.youtube.com/@Unresolvable", fetchImplReturning(200, "<html>no channel id here</html>"));
    expect(result).toMatchObject({ feedType: "manual", valid: false });
  });

  it("detects a direct RSS feed URL by fetching and checking its content", async () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Test</title></channel></rss>`;
    const result = await detectSource("https://example.com/feed.xml", fetchImplReturning(200, xml));
    expect(result).toMatchObject({ feedType: "rss", valid: true, rss: "https://example.com/feed.xml" });
  });

  it("detects a direct Atom feed URL by fetching and checking its content", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title></feed>`;
    const result = await detectSource("https://example.com/atom.xml", fetchImplReturning(200, xml));
    expect(result).toMatchObject({ feedType: "rss", valid: true, rss: "https://example.com/atom.xml" });
  });

  it("discovers a feed via <link rel=alternate> on a homepage", async () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed/"></head></html>`;
    const result = await detectSource("https://example.com/", fetchImplReturning(200, html));
    expect(result).toMatchObject({ feedType: "rss", valid: true, rss: "https://example.com/feed/", homepage: "https://example.com/" });
  });

  it("classifies a reachable homepage with no discoverable feed as feedType website", async () => {
    const html = `<html><body>Just a homepage, no feed link.</body></html>`;
    const result = await detectSource("https://example.com/", fetchImplReturning(200, html));
    expect(result).toMatchObject({ feedType: "website", valid: true, homepage: "https://example.com/" });
  });

  it("falls back to manual when the URL can't be fetched at all (network error)", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await detectSource("https://unreachable.example.com/", fetchImpl);
    expect(result).toMatchObject({ feedType: "manual", valid: false });
  });

  it("falls back to manual for a syntactically invalid URL", async () => {
    const result = await detectSource("not a url at all");
    expect(result).toMatchObject({ feedType: "manual", valid: false });
  });
});
