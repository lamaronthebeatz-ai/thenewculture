/**
 * Source Manager — Add Source detection (Phase 10). Given one pasted
 * URL (a homepage, a YouTube channel URL, or a direct feed URL),
 * determines the feed type, the canonical URL(s) to store, and whether
 * detection succeeded — never throws; a network error or unrecognized
 * input becomes `{ feedType: "manual", valid: false }` ("If detection
 * fails -> Save as Manual"), same never-throw discipline as
 * src/collectors/rss.ts.
 *
 * Real (not a URL-shape heuristic alone) auto-discovery — fetching the
 * page and looking for a YouTube channel id or an RSS/Atom
 * <link rel="alternate"> tag — needs a live network call, which this
 * sandboxed dev environment cannot make (see Phase 8.1's audit) but a
 * deployed Cloudflare Worker can. `fetchImpl` is injectable so this is
 * fully unit-testable against synthetic responses either way.
 */
import { FeedType } from "./types";

export type FetchImpl = typeof fetch;

export interface DetectionResult {
  feedType: FeedType;
  valid: boolean;
  homepage: string | null;
  rss: string | null;
  youtube: string | null;
  reason: string;
}

const YOUTUBE_CHANNEL_ID_PATTERN = /\/channel\/(UC[0-9A-Za-z_-]{10,})/;
const FEED_PATH_HINT = /(\/feed\/?$|\/rss\/?$|\.xml(\?.*)?$|\/atom\.xml(\?.*)?$)/i;

function isYoutubeHost(hostname: string): boolean {
  return hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com";
}

function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function extractYoutubeChannelIdFromHtml(html: string): string | null {
  const metaMatch = html.match(/<meta\s+itemprop=["']channelId["']\s+content=["'](UC[0-9A-Za-z_-]{10,})["']/i);
  if (metaMatch) return metaMatch[1]!;
  const jsonMatch = html.match(/"channelId":"(UC[0-9A-Za-z_-]{10,})"/);
  if (jsonMatch) return jsonMatch[1]!;
  return null;
}

function looksLikeFeedXml(text: string): boolean {
  const head = text.slice(0, 500);
  return /<rss[\s>]/i.test(head) || /<feed[\s>]/i.test(head) || (/^\s*<\?xml/i.test(head) && (/<rss/i.test(text) || /<feed/i.test(text)));
}

function extractFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  const linkPattern = /<link\s+[^>]*rel=["']alternate["'][^>]*>/gi;
  const matches = html.match(linkPattern) ?? [];
  for (const tag of matches) {
    if (!/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      return new URL(hrefMatch[1]!, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function safeFetchText(url: string, fetchImpl: FetchImpl): Promise<string | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Detects what a pasted URL is and how to collect from it. Assumes
 * the URL is already known to be syntactically well-formed (see
 * validation.ts's `validateUrlFormat` — a malformed URL is an
 * "Invalid URL" rejection, a different case from "detection fails"). */
export async function detectSource(pastedUrl: string, fetchImpl: FetchImpl = fetch): Promise<DetectionResult> {
  let parsed: URL;
  try {
    parsed = new URL(pastedUrl);
  } catch {
    return { feedType: "manual", valid: false, homepage: null, rss: null, youtube: null, reason: "URL không hợp lệ." };
  }

  if (isYoutubeHost(parsed.hostname)) {
    const directMatch = pastedUrl.match(YOUTUBE_CHANNEL_ID_PATTERN);
    if (directMatch) {
      const channelId = directMatch[1]!;
      return { feedType: "youtube", valid: true, homepage: pastedUrl, rss: null, youtube: youtubeFeedUrl(channelId), reason: "Channel ID trích xuất trực tiếp từ URL." };
    }
    // /@handle, /c/Name, /user/Name — needs a live page fetch to resolve to a channel id.
    const html = await safeFetchText(pastedUrl, fetchImpl);
    const channelId = html ? extractYoutubeChannelIdFromHtml(html) : null;
    if (channelId) {
      return { feedType: "youtube", valid: true, homepage: pastedUrl, rss: null, youtube: youtubeFeedUrl(channelId), reason: "Channel ID tìm thấy sau khi tải trang." };
    }
    return { feedType: "manual", valid: false, homepage: pastedUrl, rss: null, youtube: null, reason: "Không xác định được channel ID của YouTube." };
  }

  if (FEED_PATH_HINT.test(parsed.pathname)) {
    // A hinting path ("/feed", "/rss", ".xml") is still verified by
    // fetching it — never trust the URL shape alone, since "/feed"
    // could still 404 or return an ordinary HTML page.
    const text = await safeFetchText(pastedUrl, fetchImpl);
    if (text && looksLikeFeedXml(text)) {
      return { feedType: "rss", valid: true, homepage: null, rss: pastedUrl, youtube: null, reason: "URL trả về nội dung RSS/Atom hợp lệ." };
    }
    // Falls through to homepage-style discovery below — a "/feed"-ish
    // path that isn't actually a feed might still be a normal page.
  }

  const html = await safeFetchText(pastedUrl, fetchImpl);
  if (html === null) {
    return { feedType: "manual", valid: false, homepage: pastedUrl, rss: null, youtube: null, reason: "Không thể tải URL này." };
  }
  if (looksLikeFeedXml(html)) {
    return { feedType: "rss", valid: true, homepage: null, rss: pastedUrl, youtube: null, reason: "URL trả về nội dung RSS/Atom hợp lệ." };
  }
  const discoveredFeed = extractFeedLinkFromHtml(html, pastedUrl);
  if (discoveredFeed) {
    return { feedType: "rss", valid: true, homepage: pastedUrl, rss: discoveredFeed, youtube: null, reason: "Tìm thấy feed RSS/Atom qua thẻ <link> của trang." };
  }
  const embeddedChannelId = extractYoutubeChannelIdFromHtml(html);
  if (embeddedChannelId) {
    return { feedType: "youtube", valid: true, homepage: pastedUrl, rss: null, youtube: youtubeFeedUrl(embeddedChannelId), reason: "Tìm thấy channel YouTube được nhúng trong trang." };
  }
  return { feedType: "website", valid: true, homepage: pastedUrl, rss: null, youtube: null, reason: "Trang web hợp lệ nhưng không tìm thấy feed tự động." };
}
