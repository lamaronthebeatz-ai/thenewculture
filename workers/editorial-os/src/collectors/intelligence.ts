/**
 * Editorial Intelligence engine (Phase 8) — independent from
 * editorial.ts's PriorityEngine and events.ts's ConfidenceEngine
 * (neither is imported or modified here). Computes Priority, Confidence,
 * Freshness, Impact, SourceCount, DuplicateScore, and EditorialScore for
 * one deduplicated RawNewsItem. Pure rule engine, no AI — every formula
 * below only ever reads named weights from config.ts.
 */
import { newsIntelligenceWeights } from "../config";
import { RawNewsItem } from "./base";

export interface NewsIntelligenceScore {
  priority: number;
  confidence: number;
  freshness: number;
  impact: number;
  sourceCount: number;
  duplicateScore: number;
  editorialScore: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class EditorialIntelligenceEngine {
  constructor(private weights: typeof newsIntelligenceWeights = newsIntelligenceWeights) {}

  private computeFreshness(publishedAt: string | null, now: Date): number {
    if (!publishedAt) return 0;
    const publishedMs = Date.parse(publishedAt);
    if (Number.isNaN(publishedMs)) return 0;
    const hoursSincePublish = (now.getTime() - publishedMs) / (1000 * 60 * 60);
    if (hoursSincePublish < 0) return 100; // scheduled/clock-skew future timestamp: treat as freshest
    const windowHours = this.weights.freshnessWindowHours;
    return clamp(100 * (1 - hoursSincePublish / windowHours), 0, 100);
  }

  private computeImpact(item: RawNewsItem): number {
    return this.weights.tierImpact[item.sourceTier] ?? 0;
  }

  private computeConfidence(sourceCount: number): number {
    const extraSources = Math.max(0, sourceCount - 1);
    return clamp(this.weights.confidenceBase + extraSources * this.weights.confidencePerExtraSource, 0, 100);
  }

  private computeSourceCountScore(sourceCount: number): number {
    return clamp(sourceCount * this.weights.sourceCountWeight, 0, 100);
  }

  private computeDuplicateScore(duplicatesMerged: number): number {
    return clamp(duplicatesMerged * this.weights.duplicateScoreWeight, 0, 100);
  }

  private computePriority(freshness: number, impact: number, sourceCountScore: number): number {
    const weighted =
      freshness * this.weights.priorityFreshnessWeight +
      impact * this.weights.priorityImpactWeight +
      sourceCountScore * this.weights.prioritySourceCountWeight;
    return clamp(weighted, 0, 100);
  }

  private computeEditorialScore(metrics: Omit<NewsIntelligenceScore, "editorialScore">): number {
    const w = this.weights.editorialScoreWeights;
    const weighted =
      metrics.priority * w.priority +
      metrics.confidence * w.confidence +
      metrics.freshness * w.freshness +
      metrics.impact * w.impact +
      metrics.sourceCount * w.sourceCount +
      metrics.duplicateScore * w.duplicateScore;
    return clamp(weighted, 0, 100);
  }

  score(item: RawNewsItem, sourceCount: number, duplicatesMerged: number, now: Date = new Date()): NewsIntelligenceScore {
    const freshness = round2(this.computeFreshness(item.publishedAt, now));
    const impact = round2(this.computeImpact(item));
    const confidence = round2(this.computeConfidence(sourceCount));
    const sourceCountScore = round2(this.computeSourceCountScore(sourceCount));
    const duplicateScore = round2(this.computeDuplicateScore(duplicatesMerged));
    const priority = round2(this.computePriority(freshness, impact, sourceCountScore));
    const editorialScore = round2(
      this.computeEditorialScore({
        priority,
        confidence,
        freshness,
        impact,
        sourceCount: sourceCountScore,
        duplicateScore,
      }),
    );

    return {
      priority,
      confidence,
      freshness,
      impact,
      sourceCount: sourceCountScore,
      duplicateScore,
      editorialScore,
    };
  }

  threshold(): number {
    return this.weights.entryThreshold;
  }

  isAboveThreshold(score: NewsIntelligenceScore): boolean {
    return score.editorialScore >= this.threshold();
  }
}
