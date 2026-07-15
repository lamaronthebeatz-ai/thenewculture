/**
 * Collectors — shared types (Phase 8, News Intelligence Collector).
 *
 * This whole `src/collectors/` directory is a pure EXTENSION: nothing
 * here modifies collector.ts, providers.ts, queue.ts, events.ts,
 * editorial.ts, workspace.ts, worker/*, api.ts, or kv.ts. The one
 * integration point is service.ts, which turns the `RawPayload[]` this
 * layer produces into the exact same shape `NewsProvider`'s bundled
 * `FIXTURE_EVENTS` already use (see providers.ts) and hands it to the
 * *existing, unmodified* `WorkerRunner` via its *already-existing*
 * `fixtures` option — nothing downstream needs to know these events
 * came from a real feed instead of a fixture file.
 */
import { SourceTier } from "../models";
import type { RawPayload } from "../providers";

/** One item as extracted from an RSS/Atom/YouTube feed, before it is
 * squeezed into the existing EditorialEvent-shaped RawPayload. Kept as
 * its own type so the News Duplicate Detector and Editorial
 * Intelligence engine can operate on genuine news-story fields
 * (summary/author/thumbnail/category) that don't all have a home on
 * EditorialEvent, without requiring any change to models.ts. */
export interface RawNewsItem {
  title: string;
  summary: string;
  url: string;
  canonicalUrl: string;
  publishedAt: string | null;
  author: string | null;
  thumbnail: string | null;
  category: string | null;
  rawContent: string | null;
  sourceId: string;
  sourceName: string;
  sourceTier: SourceTier;
}

export type SourceType = "rss" | "atom" | "youtube";

/** One row of the source configuration table (spec: "Never hardcode
 * inside collectors. Create one configuration table."). No entries are
 * shipped with an unverifiable feed URL — see sources.ts. */
export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  feed: string;
  tier: SourceTier;
  enabled: boolean;
  timeoutMs: number;
  retry: number;
  /** Rule-based fallback artist attribution for sources that are a
   * single artist's own channel (e.g. a YouTube channel) — used only
   * when a title doesn't clearly name a different artist. Optional;
   * general publications (Billboard, Complex, ...) leave this unset and
   * fall back to the source's own `name`. */
  defaultArtist?: string;
}

export type CollectorHealthStatus =
  | "healthy"
  | "timeout"
  | "http_404"
  | "http_error"
  | "parsing_error"
  | "disabled";

export interface CollectorFetchResult {
  sourceId: string;
  sourceName: string;
  status: CollectorHealthStatus;
  items: RawNewsItem[];
  responseTimeMs: number | null;
  retryCount: number;
  errorMessage: string | null;
}

/** Canonicalizes a URL for duplicate comparison: lowercases the host,
 * strips a trailing slash, drops query string and fragment. Pure
 * string/URL-object manipulation — no network, no AI. */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export type RawEventType =
  | "album_release"
  | "single_release"
  | "mv_release"
  | "artist_announcement"
  | "festival"
  | "concert"
  | "interview"
  | "award"
  | "community_event";

const KEYWORD_EVENT_TYPE_RULES: Array<{ pattern: RegExp; eventType: RawEventType }> = [
  { pattern: /\balbum\b/i, eventType: "album_release" },
  { pattern: /\bsingle\b/i, eventType: "single_release" },
  { pattern: /\b(mv|music video)\b/i, eventType: "mv_release" },
  { pattern: /\bfestival\b/i, eventType: "festival" },
  { pattern: /\b(concert|live show|live)\b/i, eventType: "concert" },
  { pattern: /\binterview\b/i, eventType: "interview" },
  { pattern: /\baward[s]?\b/i, eventType: "award" },
  { pattern: /\b(announce|announcement|debut)\b/i, eventType: "artist_announcement" },
];

/** Rule-based (no AI) best-effort classification of a free-text news
 * title into one of the 9 existing EventType values. Defaults to
 * "community_event" — the closest existing bucket for generic news —
 * when no keyword matches, since EditorialEvent.eventType is a required,
 * strongly-typed field downstream (events.ts's validateEvent()). */
export function classifyEventType(title: string): RawEventType {
  for (const rule of KEYWORD_EVENT_TYPE_RULES) {
    if (rule.pattern.test(title)) return rule.eventType;
  }
  return "community_event";
}

/** Converts one deduplicated, scored RawNewsItem into the exact
 * RawPayload shape providers.ts's NewsProvider/FIXTURE_EVENTS already
 * use — the only place a "Story" (this layer's own model) is squeezed
 * into the existing, unmodified EditorialEvent pipeline. `defaultArtist`
 * is the source's own configured fallback (see SourceConfig); a
 * generic publication falls back to its own name. */
export function newsItemToRawPayload(item: RawNewsItem, defaultArtist?: string): RawPayload {
  return {
    title: item.title,
    artist: defaultArtist || item.sourceName,
    event_type: classifyEventType(item.title),
    description: item.summary,
    published_at: item.publishedAt,
    platform: item.sourceName,
    image: item.thumbnail,
    related_artists: [],
    related_profiles: [],
    sources: [
      {
        name: item.sourceName,
        tier: item.sourceTier,
        url: item.url,
        retrieved_at: new Date().toISOString(),
      },
    ],
  };
}
