/**
 * News Duplicate Detector (Phase 8) — independent from events.ts's
 * DuplicateEngine (which requires an artist+eventType match first, a
 * gate that makes no sense for generic news stories with no artist
 * field). This engine works directly on RawNewsItem, before anything
 * is converted into an EditorialEvent, and events.ts is never imported
 * or modified here.
 *
 * Rules (spec): same url, same canonical url, high title similarity,
 * same publish timestamp — keep highest quality source. Title
 * similarity alone is deliberately not treated as sufficient by itself
 * (two unrelated stories can share a generic recurring headline
 * phrase); it only counts together with a matching publish timestamp,
 * the same "don't trust one fuzzy signal alone" caution the sibling
 * DuplicateEngine already applies, independently re-implemented here.
 */
import { SourceTier } from "../models";
import { RawNewsItem } from "./base";

const TIER_RANK: Record<SourceTier, number> = {
  [SourceTier.TIER_1]: 0,
  [SourceTier.TIER_2]: 1,
  [SourceTier.TIER_3]: 2,
  [SourceTier.UNKNOWN]: 3,
};

function tokenize(title: string): Set<string> {
  const normalized = title
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

/** Jaccard (intersection-over-union) word-token similarity, 0-1. A
 * separate, independent technique from events.ts's Ratcliff/Obershelp
 * character-sequence matcher — this engine must not import from or
 * modify events.ts at all. */
export function titleSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DeduplicationResult {
  kept: RawNewsItem[];
  duplicatesRemoved: number;
  /** canonicalUrl of the kept item -> count of distinct sources that
   * reported it (used by intelligence.ts's SourceCount metric). */
  sourceCounts: Map<string, number>;
  /** canonicalUrl of the kept item -> how many items were merged into
   * it, including itself (used by intelligence.ts's DuplicateScore). */
  groupSizes: Map<string, number>;
}

export class NewsDuplicateDetector {
  constructor(private titleSimilarityThreshold = 0.6) {}

  isDuplicate(a: RawNewsItem, b: RawNewsItem): boolean {
    if (a.url === b.url) return true;
    if (a.canonicalUrl === b.canonicalUrl) return true;
    if (a.publishedAt && b.publishedAt && a.publishedAt === b.publishedAt) {
      if (titleSimilarity(a.title, b.title) >= this.titleSimilarityThreshold) return true;
    }
    return false;
  }

  private bestOf(group: RawNewsItem[]): RawNewsItem {
    return [...group].sort((a, b) => TIER_RANK[a.sourceTier] - TIER_RANK[b.sourceTier])[0]!;
  }

  deduplicate(items: RawNewsItem[]): DeduplicationResult {
    const groups: RawNewsItem[][] = [];
    for (const item of items) {
      const group = groups.find((existingGroup) => existingGroup.some((member) => this.isDuplicate(member, item)));
      if (group) {
        group.push(item);
      } else {
        groups.push([item]);
      }
    }

    const kept: RawNewsItem[] = [];
    const sourceCounts = new Map<string, number>();
    const groupSizes = new Map<string, number>();
    let duplicatesRemoved = 0;

    for (const group of groups) {
      const best = this.bestOf(group);
      kept.push(best);
      duplicatesRemoved += group.length - 1;
      sourceCounts.set(best.canonicalUrl, new Set(group.map((member) => member.sourceId)).size);
      groupSizes.set(best.canonicalUrl, group.length);
    }

    return { kept, duplicatesRemoved, sourceCounts, groupSizes };
  }
}
