import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { RawNewsItem } from "../../../src/collectors/base";
import { NewsDuplicateDetector, titleSimilarity } from "../../../src/collectors/duplicate";

function makeItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    title: "HIEUTHUHAI ra mắt album mới",
    summary: "summary",
    url: "https://example.com/a",
    canonicalUrl: "example.com/a",
    publishedAt: "2026-01-20T09:00:00Z",
    author: null,
    thumbnail: null,
    category: null,
    rawContent: null,
    sourceId: "source-a",
    sourceName: "Source A",
    sourceTier: SourceTier.TIER_2,
    ...overrides,
  };
}

describe("titleSimilarity", () => {
  it("is 1 for identical titles", () => {
    expect(titleSimilarity("Album Mới Ra Mắt", "Album Mới Ra Mắt")).toBe(1);
  });

  it("is 0 for completely different titles", () => {
    expect(titleSimilarity("Album Mới Ra Mắt", "Festival Sắp Diễn Ra")).toBeLessThan(0.3);
  });

  it("is high for titles sharing most words", () => {
    const sim = titleSimilarity("HIEUTHUHAI ra mắt album mới", "HIEUTHUHAI vừa ra mắt album mới hôm nay");
    expect(sim).toBeGreaterThan(0.5);
  });
});

describe("NewsDuplicateDetector.isDuplicate", () => {
  it("matches on identical url alone", () => {
    const a = makeItem({ url: "https://example.com/x", canonicalUrl: "a", title: "T1", publishedAt: "2026-01-01" });
    const b = makeItem({ url: "https://example.com/x", canonicalUrl: "b", title: "T2", publishedAt: "2026-02-02" });
    expect(new NewsDuplicateDetector().isDuplicate(a, b)).toBe(true);
  });

  it("matches on identical canonical url alone", () => {
    const a = makeItem({ url: "https://example.com/x?a=1", canonicalUrl: "example.com/x", title: "T1", publishedAt: "2026-01-01" });
    const b = makeItem({ url: "https://example.com/x?a=2", canonicalUrl: "example.com/x", title: "T2", publishedAt: "2026-02-02" });
    expect(new NewsDuplicateDetector().isDuplicate(a, b)).toBe(true);
  });

  it("matches on high title similarity + same publish timestamp together", () => {
    const a = makeItem({ url: "https://a.com/1", canonicalUrl: "a.com/1", title: "HIEUTHUHAI ra mắt album mới", publishedAt: "2026-01-20T09:00:00Z" });
    const b = makeItem({ url: "https://b.com/2", canonicalUrl: "b.com/2", title: "HIEUTHUHAI ra mắt album mới hôm nay", publishedAt: "2026-01-20T09:00:00Z" });
    expect(new NewsDuplicateDetector().isDuplicate(a, b)).toBe(true);
  });

  it("does NOT match on title similarity alone without a matching timestamp", () => {
    const a = makeItem({ url: "https://a.com/1", canonicalUrl: "a.com/1", title: "HIEUTHUHAI ra mắt album mới", publishedAt: "2026-01-20T09:00:00Z" });
    const b = makeItem({ url: "https://b.com/2", canonicalUrl: "b.com/2", title: "HIEUTHUHAI ra mắt album mới hôm nay", publishedAt: "2026-03-15T09:00:00Z" });
    expect(new NewsDuplicateDetector().isDuplicate(a, b)).toBe(false);
  });

  it("does not match unrelated stories", () => {
    const a = makeItem({ url: "https://a.com/1", canonicalUrl: "a.com/1", title: "Festival Sắp Diễn Ra", publishedAt: "2026-01-20T09:00:00Z" });
    const b = makeItem({ url: "https://b.com/2", canonicalUrl: "b.com/2", title: "MCK ra đĩa đơn mới", publishedAt: "2026-01-20T09:00:00Z" });
    expect(new NewsDuplicateDetector().isDuplicate(a, b)).toBe(false);
  });
});

describe("NewsDuplicateDetector.deduplicate", () => {
  it("keeps the highest-tier source among a duplicate group", () => {
    const low = makeItem({
      url: "https://low.com/x", canonicalUrl: "same", sourceId: "low", sourceTier: SourceTier.TIER_3,
    });
    const high = makeItem({
      url: "https://high.com/x", canonicalUrl: "same", sourceId: "high", sourceTier: SourceTier.TIER_1,
    });
    const result = new NewsDuplicateDetector().deduplicate([low, high]);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.sourceId).toBe("high");
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("counts distinct sources and group size correctly", () => {
    const a = makeItem({ url: "https://x.com/1", canonicalUrl: "same", sourceId: "s1" });
    const b = makeItem({ url: "https://x.com/1", canonicalUrl: "same", sourceId: "s2" });
    const c = makeItem({ url: "https://x.com/1", canonicalUrl: "same", sourceId: "s2" }); // same source, still same url
    const result = new NewsDuplicateDetector().deduplicate([a, b, c]);
    expect(result.kept).toHaveLength(1);
    const key = result.kept[0]!.canonicalUrl;
    expect(result.sourceCounts.get(key)).toBe(2); // s1, s2 distinct
    expect(result.groupSizes.get(key)).toBe(3); // 3 raw items merged
    expect(result.duplicatesRemoved).toBe(2);
  });

  it("leaves unrelated items ungrouped", () => {
    const a = makeItem({ url: "https://a.com/1", canonicalUrl: "a", title: "Story A" });
    const b = makeItem({ url: "https://b.com/1", canonicalUrl: "b", title: "Completely Different Story B" });
    const result = new NewsDuplicateDetector().deduplicate([a, b]);
    expect(result.kept).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it("handles an empty input", () => {
    const result = new NewsDuplicateDetector().deduplicate([]);
    expect(result.kept).toEqual([]);
    expect(result.duplicatesRemoved).toBe(0);
  });
});
