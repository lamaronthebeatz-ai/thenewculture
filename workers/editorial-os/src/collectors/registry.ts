/**
 * News collector registry/orchestrator (Phase 8). The one function
 * service.ts calls: fetches every enabled configured source, dedupes,
 * scores, filters by threshold, sorts, and converts survivors into the
 * exact RawPayload shape providers.ts's NewsProvider already expects —
 * see base.ts's module docstring for why that's the whole integration
 * story (no change to collector.ts/providers.ts/worker/* needed).
 */
import type { RawPayload } from "../providers";
import { CollectorFetchResult, RawNewsItem, SourceConfig, newsItemToRawPayload } from "./base";
import { CollectorHealthEntry, CollectorHealthTracker } from "./health";
import { NewsIntelligenceScore, EditorialIntelligenceEngine } from "./intelligence";
import { NewsDuplicateDetector } from "./duplicate";
import { fetchRssFeed, FetchImpl } from "./rss";
import { fetchYoutubeFeed } from "./youtube";

export interface NewsStorySummary {
  title: string;
  url: string;
  editorialScore: number;
  publishedAt: string | null;
}

export interface NewsCollectionResult {
  payloads: RawPayload[];
  health: CollectorHealthEntry[];
  collected: number;
  accepted: number;
  rejected: number;
  duplicatesRemoved: number;
  topStory: NewsStorySummary | null;
  newestStory: NewsStorySummary | null;
  lastCrawlAt: string;
}

function pickFetcher(source: SourceConfig) {
  return source.type === "youtube" ? fetchYoutubeFeed : fetchRssFeed;
}

/** Collects every enabled source, dedupes, scores, and returns only the
 * stories at/above the configured EditorialScore threshold, sorted
 * EditorialScore DESC then publishedAt DESC — the exact Queue-entry
 * rule from the spec, applied here (before the existing pipeline even
 * sees these events) rather than inside collector.ts/queue.ts. */
export async function collectAllNews(
  sources: SourceConfig[],
  fetchImpl: FetchImpl = fetch,
  now: Date = new Date(),
): Promise<NewsCollectionResult> {
  const lastCrawlAt = now.toISOString();
  const enabledSources = sources.filter((s) => s.enabled);

  const resultsBySourceId = new Map<string, CollectorFetchResult>();
  const allItems: RawNewsItem[] = [];

  for (const source of enabledSources) {
    const result = await pickFetcher(source)(source, fetchImpl);
    resultsBySourceId.set(source.id, result);
    allItems.push(...result.items);
  }

  const health = new CollectorHealthTracker().build(sources, resultsBySourceId, lastCrawlAt);

  const { kept, duplicatesRemoved, sourceCounts, groupSizes } = new NewsDuplicateDetector().deduplicate(allItems);

  const intelligence = new EditorialIntelligenceEngine();
  const scored: Array<{ item: RawNewsItem; score: NewsIntelligenceScore }> = kept.map((item) => {
    const sourceCount = sourceCounts.get(item.canonicalUrl) ?? 1;
    const duplicatesMerged = (groupSizes.get(item.canonicalUrl) ?? 1) - 1;
    return { item, score: intelligence.score(item, sourceCount, duplicatesMerged, now) };
  });

  const accepted = scored.filter(({ score }) => intelligence.isAboveThreshold(score));
  const rejected = scored.length - accepted.length;

  accepted.sort((a, b) => {
    if (b.score.editorialScore !== a.score.editorialScore) return b.score.editorialScore - a.score.editorialScore;
    const aTime = a.item.publishedAt ? Date.parse(a.item.publishedAt) : -Infinity;
    const bTime = b.item.publishedAt ? Date.parse(b.item.publishedAt) : -Infinity;
    return bTime - aTime;
  });

  const payloads = accepted.map(({ item }) => {
    const sourceConfig = sources.find((s) => s.id === item.sourceId);
    return newsItemToRawPayload(item, sourceConfig?.defaultArtist);
  });

  const topStory: NewsStorySummary | null = accepted.length
    ? {
        title: accepted[0]!.item.title,
        url: accepted[0]!.item.url,
        editorialScore: accepted[0]!.score.editorialScore,
        publishedAt: accepted[0]!.item.publishedAt,
      }
    : null;

  const newest = [...accepted].sort((a, b) => {
    const aTime = a.item.publishedAt ? Date.parse(a.item.publishedAt) : -Infinity;
    const bTime = b.item.publishedAt ? Date.parse(b.item.publishedAt) : -Infinity;
    return bTime - aTime;
  })[0];
  const newestStory: NewsStorySummary | null = newest
    ? {
        title: newest.item.title,
        url: newest.item.url,
        editorialScore: newest.score.editorialScore,
        publishedAt: newest.item.publishedAt,
      }
    : null;

  return {
    payloads,
    health,
    collected: allItems.length,
    accepted: accepted.length,
    rejected,
    duplicatesRemoved,
    topStory,
    newestStory,
    lastCrawlAt,
  };
}
