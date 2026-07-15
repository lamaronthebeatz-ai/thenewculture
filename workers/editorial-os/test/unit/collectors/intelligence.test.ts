import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import { newsIntelligenceWeights } from "../../../src/config";
import { RawNewsItem } from "../../../src/collectors/base";
import { EditorialIntelligenceEngine } from "../../../src/collectors/intelligence";

function makeItem(overrides: Partial<RawNewsItem> = {}): RawNewsItem {
  return {
    title: "Test Story",
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
    sourceTier: SourceTier.TIER_1,
    ...overrides,
  };
}

const NOW = new Date("2026-01-20T09:00:00Z");

describe("EditorialIntelligenceEngine.score", () => {
  it("gives a brand-new tier_1 story with 1 source a high freshness/impact", () => {
    const engine = new EditorialIntelligenceEngine();
    const score = engine.score(makeItem({ sourceTier: SourceTier.TIER_1 }), 1, 0, NOW);
    expect(score.freshness).toBe(100); // published exactly "now"
    expect(score.impact).toBe(newsIntelligenceWeights.tierImpact.tier_1);
    expect(score.confidence).toBe(newsIntelligenceWeights.confidenceBase); // 1 source = base only
  });

  it("freshness decays linearly toward 0 over the configured window", () => {
    const engine = new EditorialIntelligenceEngine();
    const halfWindow = new Date(NOW.getTime() + (newsIntelligenceWeights.freshnessWindowHours / 2) * 3600 * 1000);
    const score = engine.score(makeItem({ publishedAt: NOW.toISOString() }), 1, 0, halfWindow);
    expect(score.freshness).toBeCloseTo(50, 0);
  });

  it("freshness is 0 for a story older than the window, and for missing publishedAt", () => {
    const engine = new EditorialIntelligenceEngine();
    const wayLater = new Date(NOW.getTime() + (newsIntelligenceWeights.freshnessWindowHours * 3) * 3600 * 1000);
    expect(engine.score(makeItem({ publishedAt: NOW.toISOString() }), 1, 0, wayLater).freshness).toBe(0);
    expect(engine.score(makeItem({ publishedAt: null }), 1, 0, NOW).freshness).toBe(0);
  });

  it("confidence increases with sourceCount, capped at 100", () => {
    const engine = new EditorialIntelligenceEngine();
    const oneSource = engine.score(makeItem(), 1, 0, NOW).confidence;
    const fiveSources = engine.score(makeItem(), 5, 0, NOW).confidence;
    expect(fiveSources).toBeGreaterThan(oneSource);
    const hundredSources = engine.score(makeItem(), 100, 0, NOW).confidence;
    expect(hundredSources).toBeLessThanOrEqual(100);
  });

  it("duplicateScore increases with duplicatesMerged, capped at 100", () => {
    const engine = new EditorialIntelligenceEngine();
    expect(engine.score(makeItem(), 1, 0, NOW).duplicateScore).toBe(0);
    expect(engine.score(makeItem(), 1, 3, NOW).duplicateScore).toBeGreaterThan(0);
    expect(engine.score(makeItem(), 1, 1000, NOW).duplicateScore).toBeLessThanOrEqual(100);
  });

  it("tier_3 sources score lower impact than tier_1", () => {
    const engine = new EditorialIntelligenceEngine();
    const tier1 = engine.score(makeItem({ sourceTier: SourceTier.TIER_1 }), 1, 0, NOW).impact;
    const tier3 = engine.score(makeItem({ sourceTier: SourceTier.TIER_3 }), 1, 0, NOW).impact;
    expect(tier1).toBeGreaterThan(tier3);
  });

  it("editorialScore is a weighted combination, all metrics 0-100", () => {
    const engine = new EditorialIntelligenceEngine();
    const score = engine.score(makeItem(), 3, 1, NOW);
    for (const key of ["priority", "confidence", "freshness", "impact", "sourceCount", "duplicateScore", "editorialScore"] as const) {
      expect(score[key]).toBeGreaterThanOrEqual(0);
      expect(score[key]).toBeLessThanOrEqual(100);
    }
  });

  it("isAboveThreshold matches the configured entryThreshold", () => {
    const engine = new EditorialIntelligenceEngine();
    expect(engine.threshold()).toBe(newsIntelligenceWeights.entryThreshold);
    expect(engine.isAboveThreshold({ priority: 0, confidence: 0, freshness: 0, impact: 0, sourceCount: 0, duplicateScore: 0, editorialScore: 100 })).toBe(true);
    expect(engine.isAboveThreshold({ priority: 0, confidence: 0, freshness: 0, impact: 0, sourceCount: 0, duplicateScore: 0, editorialScore: 0 })).toBe(false);
  });

  it("is config-driven — custom weights change the result", () => {
    const customEngine = new EditorialIntelligenceEngine({
      ...newsIntelligenceWeights,
      tierImpact: { ...newsIntelligenceWeights.tierImpact, tier_1: 5 },
    });
    const score = customEngine.score(makeItem({ sourceTier: SourceTier.TIER_1 }), 1, 0, NOW);
    expect(score.impact).toBe(5);
  });
});
