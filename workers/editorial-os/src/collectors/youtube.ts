/**
 * YouTube collector (Phase 8). A YouTube channel's uploads feed is a
 * public Atom feed —
 *   https://www.youtube.com/feeds/videos.xml?channel_id=<UC...>
 * — requiring no API key/secret and no new wrangler.toml binding. This
 * file is a thin, dedicated wrapper around rss.ts's fetch/parse
 * machinery (kept separate per the spec's file list, and so YouTube-
 * specific bookkeeping like the video id never leaks into rss.ts).
 */
import { CollectorFetchResult, RawNewsItem, SourceConfig } from "./base";
import { FetchImpl, fetchRssFeed } from "./rss";

const YOUTUBE_VIDEO_ID_RE = /[?&]v=([a-zA-Z0-9_-]{6,})/;

/** Extracts the `v=<id>` query param from a youtube.com/watch URL, if
 * present — used only for a cleaner canonical id in duplicate.ts;
 * canonicalizeUrl() already handles ordinary URL-shape dedup regardless. */
export function extractYoutubeVideoId(url: string): string | null {
  return url.match(YOUTUBE_VIDEO_ID_RE)?.[1] ?? null;
}

function withVideoIds(items: RawNewsItem[]): RawNewsItem[] {
  return items.map((item) => {
    const videoId = extractYoutubeVideoId(item.url);
    return videoId ? { ...item, canonicalUrl: `youtube:${videoId}` } : item;
  });
}

/** Fetches and parses one configured YouTube channel feed. Same
 * timeout/retry/health-classification behavior as fetchRssFeed() — this
 * function only adds YouTube-specific canonical-id handling on top. */
export async function fetchYoutubeFeed(
  source: SourceConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<CollectorFetchResult> {
  const result = await fetchRssFeed(source, fetchImpl);
  if (result.status !== "healthy") return result;
  return { ...result, items: withVideoIds(result.items) };
}
