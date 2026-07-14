/**
 * Editorial — 1:1 port of editorial-intelligence/editorial/{story,
 * priority,decision,assignment,recommendation,cover_story,issue_planner,
 * dashboard,desk}.py (Phase 3, the Editorial Intelligence layer).
 */
import {
  assignmentRules,
  coverStoryRules,
  dashboardConfig,
  editorialDecisionRules,
  issueBalance,
  priorityWeights,
  storyClassification,
} from "./config";
import {
  DashboardStats,
  EditorialAssignment,
  EditorialDecisionType,
  EditorialEvent,
  EventStatus,
  makeEmptyAssignment,
  makeStoryCandidate,
  Recommendations,
  StoryCandidate,
  StoryType,
} from "./models";

// =======================================================================
// story.py — Story Layer
// =======================================================================

export class StoryLayer {
  private rules: typeof storyClassification;

  constructor(rules: typeof storyClassification = storyClassification) {
    this.rules = rules;
  }

  classify(event: EditorialEvent, referenceDate?: Date, override?: StoryType): StoryType {
    if (override !== undefined) return override;
    if (this.isBreaking(event, referenceDate)) return StoryType.BREAKING;

    const defaultMap = this.rules.defaultByEventType;
    return defaultMap[event.eventType] ?? StoryType.EDITORIAL;
  }

  private isBreaking(event: EditorialEvent, referenceDate?: Date): boolean {
    const eligible = this.rules.breakingEligibleEventTypes;
    if (!eligible.includes(event.eventType)) return false;
    if (event.confidence < this.rules.breakingMinConfidence) return false;
    if (!event.publishedAt) return false;

    const publishedText = String(event.publishedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedText)) return false;
    const published = new Date(`${publishedText}T00:00:00Z`);
    if (Number.isNaN(published.getTime())) return false;

    const today = referenceDate ?? new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const withinDays = this.rules.breakingWithinDays;
    const deltaDays = Math.round((todayUtc - published.getTime()) / 86400000);
    return deltaDays >= 0 && deltaDays <= withinDays;
  }

  build(event: EditorialEvent, referenceDate?: Date, override?: StoryType): StoryCandidate {
    const storyType = this.classify(event, referenceDate, override);
    return makeStoryCandidate(event, storyType);
  }
}

// =======================================================================
// priority.py — Priority Engine
// =======================================================================

export class PriorityEngine {
  private weights: typeof priorityWeights;

  constructor(weights: typeof priorityWeights = priorityWeights) {
    this.weights = weights;
  }

  score(story: StoryCandidate): number {
    const event = story.event;
    const base = this.weights.storyTypeWeights[story.storyType] ?? 0;
    const confidenceBonus = event.confidence * this.weights.confidenceMultiplier;

    let homepageBonus = 0;
    let magazineBonus = 0;
    const mapping = event.mappingResult;
    if (mapping !== null) {
      if (mapping.homepage) homepageBonus = this.weights.homepageBonus;
      if (mapping.magazine) magazineBonus = this.weights.magazineBonus;
    }

    return Math.trunc(base + confidenceBonus + homepageBonus + magazineBonus);
  }

  apply(story: StoryCandidate): StoryCandidate {
    story.priorityScore = this.score(story);
    return story;
  }
}

// =======================================================================
// decision.py — Editorial Decision
// =======================================================================

export class EditorialDecisionEngine {
  private rules: typeof editorialDecisionRules;

  constructor(rules: typeof editorialDecisionRules = editorialDecisionRules) {
    this.rules = rules;
  }

  decide(story: StoryCandidate): StoryCandidate {
    const event = story.event;
    const publishThreshold = this.rules.publishPriorityThreshold;
    const holdThreshold = this.rules.holdPriorityThreshold;

    if (event.status === EventStatus.REJECTED) {
      story.decision = EditorialDecisionType.REJECT;
      story.decisionReason = "Event đã bị editor từ chối (EventStatus.REJECTED).";
    } else if (event.status === EventStatus.MERGED) {
      story.decision = EditorialDecisionType.MERGE;
      story.decisionReason = "Event đã được gộp vào 1 event khác (Duplicate Engine, Phase 2).";
    } else if (event.status === EventStatus.LOW_CONFIDENCE) {
      story.decision = EditorialDecisionType.NEED_MORE_SOURCES;
      story.decisionReason = `Confidence ${event.confidence} dưới ngưỡng Prompt (Confidence Engine) — cần thêm nguồn xác thực.`;
    } else if (story.priorityScore >= publishThreshold) {
      story.decision = EditorialDecisionType.PUBLISH;
      story.decisionReason = `Priority Score ${story.priorityScore} >= ngưỡng publish ${publishThreshold}.`;
    } else if (story.priorityScore >= holdThreshold) {
      story.decision = EditorialDecisionType.HOLD;
      story.decisionReason = `Priority Score ${story.priorityScore} trong khoảng hold (${holdThreshold}-${publishThreshold}).`;
    } else {
      story.decision = EditorialDecisionType.NEED_MORE_SOURCES;
      story.decisionReason = `Priority Score ${story.priorityScore} dưới ngưỡng hold ${holdThreshold}.`;
    }

    return story;
  }
}

// =======================================================================
// recommendation.py — Recommendation Engine
// =======================================================================

export class RecommendationEngine {
  recommend(story: StoryCandidate, pool: StoryCandidate[] = []): Recommendations {
    const event = story.event;
    const mapping = event.mappingResult;

    const relatedArticles = pool
      .filter(
        (other) =>
          other !== story &&
          (other.event.artist === event.artist ||
            (Boolean(event.suggestedSeries) && other.event.suggestedSeries === event.suggestedSeries)),
      )
      .map((other) => other.event.title);

    return {
      relatedProfiles: mapping ? [...mapping.relatedProfiles] : [],
      relatedArticles,
      relatedSeries: mapping ? [...mapping.relatedSeries] : [],
      internalLinks: [...event.relatedArtists],
    };
  }
}

// =======================================================================
// assignment.py — Assignment Generator
// =======================================================================

export class AssignmentGenerator {
  private rules: typeof assignmentRules;
  private recommendationEngine: RecommendationEngine;

  constructor(rules: typeof assignmentRules = assignmentRules, recommendationEngine?: RecommendationEngine) {
    this.rules = rules;
    this.recommendationEngine = recommendationEngine ?? new RecommendationEngine();
  }

  generate(story: StoryCandidate, pool: StoryCandidate[] = []): EditorialAssignment {
    const event = story.event;
    const mapping = event.mappingResult;
    const recs = this.recommendationEngine.recommend(story, pool);

    const assignment: EditorialAssignment = {
      suggestedSeries: mapping ? mapping.series : event.suggestedSeries,
      suggestedCategory: mapping ? mapping.category : null,
      suggestedTags: mapping ? [...mapping.tags] : [...event.suggestedTags],
      suggestedProfiles: mapping ? [...mapping.profiles] : [],
      suggestedInternalLinks: [...recs.internalLinks],
      suggestedLength: this.rules.suggestedLengthByStoryType[story.storyType] ?? null,
    };
    story.assignment = assignment;
    return assignment;
  }
}

// =======================================================================
// cover_story.py — Cover Story Candidate selector
// =======================================================================

export class CoverStorySelector {
  private rules: typeof coverStoryRules;

  constructor(rules: typeof coverStoryRules = coverStoryRules) {
    this.rules = rules;
  }

  candidates(stories: StoryCandidate[], limit = 5): StoryCandidate[] {
    const eligibleTypes = new Set(this.rules.eligibleStoryTypes);
    const minPriority = this.rules.minPriorityScore;

    const pool = stories.filter(
      (s) => eligibleTypes.has(s.storyType) && s.priorityScore >= minPriority && s.decision === EditorialDecisionType.PUBLISH,
    );
    return [...pool].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
  }
}

// =======================================================================
// issue_planner.py — Issue Planner
// =======================================================================

export interface SeriesBalanceEntry {
  target: number;
  current: number;
  gap: number;
}

export class IssuePlanner {
  private config: typeof issueBalance;

  constructor(config: typeof issueBalance = issueBalance) {
    this.config = config;
  }

  private targetFor(series: string | null): number {
    if (series === null) return this.config.defaultTarget;
    return this.config.targetDistribution[series] ?? this.config.defaultTarget;
  }

  seriesBalanceReport(currentCounts: Record<string, number>): Record<string, SeriesBalanceEntry> {
    const targets = this.config.targetDistribution;
    const allSeries = new Set([...Object.keys(targets), ...Object.keys(currentCounts)]);
    const report: Record<string, SeriesBalanceEntry> = {};
    for (const series of allSeries) {
      const target = this.targetFor(series);
      const current = currentCounts[series] ?? 0;
      report[series] = { target, current, gap: target - current };
    }
    return report;
  }

  suggestForIssue(stories: StoryCandidate[], currentCounts: Record<string, number>, limit?: number): StoryCandidate[] {
    const publishable = stories.filter((s) => s.decision === EditorialDecisionType.PUBLISH);
    const ranked = [...publishable].sort((a, b) => {
      const gapA = this.targetFor(a.event.suggestedSeries) - (currentCounts[a.event.suggestedSeries ?? ""] ?? 0);
      const gapB = this.targetFor(b.event.suggestedSeries) - (currentCounts[b.event.suggestedSeries ?? ""] ?? 0);
      if (gapB !== gapA) return gapB - gapA;
      return b.priorityScore - a.priorityScore;
    });
    return limit !== undefined ? ranked.slice(0, limit) : ranked;
  }
}

// =======================================================================
// dashboard.py — Dashboard Data (Phase 3, section 8)
// =======================================================================

export class DashboardEngine {
  private config: typeof dashboardConfig;

  constructor(config: typeof dashboardConfig = dashboardConfig) {
    this.config = config;
  }

  compute(stories: StoryCandidate[]): DashboardStats {
    const highPriorityThreshold = this.config.highPriorityThreshold;

    const pending = stories.filter(
      (s) => s.decision === EditorialDecisionType.HOLD || s.decision === EditorialDecisionType.NEED_MORE_SOURCES,
    ).length;
    const highPriority = stories.filter((s) => s.priorityScore >= highPriorityThreshold).length;
    const lowConfidence = stories.filter((s) => s.event.status === EventStatus.LOW_CONFIDENCE).length;
    const duplicate = stories.filter((s) => s.decision === EditorialDecisionType.MERGE).length;
    const published = stories.filter((s) => s.decision === EditorialDecisionType.PUBLISH).length;
    const rejected = stories.filter((s) => s.decision === EditorialDecisionType.REJECT).length;

    return { pending, highPriority, lowConfidence, duplicate, published, rejected };
  }
}

// =======================================================================
// desk.py — EditorialDesk orchestrator
// =======================================================================

export interface EditorialDeskOptions {
  storyLayer?: StoryLayer;
  priorityEngine?: PriorityEngine;
  decisionEngine?: EditorialDecisionEngine;
  assignmentGenerator?: AssignmentGenerator;
}

export class EditorialDesk {
  private storyLayer: StoryLayer;
  private priority: PriorityEngine;
  private decision: EditorialDecisionEngine;
  private assignment: AssignmentGenerator;

  constructor(options: EditorialDeskOptions = {}) {
    this.storyLayer = options.storyLayer ?? new StoryLayer();
    this.priority = options.priorityEngine ?? new PriorityEngine();
    this.decision = options.decisionEngine ?? new EditorialDecisionEngine();
    this.assignment = options.assignmentGenerator ?? new AssignmentGenerator();
  }

  process(event: EditorialEvent, pool?: StoryCandidate[]): StoryCandidate {
    const story = this.storyLayer.build(event);
    this.priority.apply(story);
    this.decision.decide(story);
    this.assignment.generate(story, pool ?? [story]);
    return story;
  }

  /** Batch path, two passes: classify+score+decide every event first,
   * THEN run Assignment (so RecommendationEngine's Related Articles can
   * see the whole batch). */
  processAll(events: EditorialEvent[]): StoryCandidate[] {
    const stories: StoryCandidate[] = [];
    for (const event of events) {
      const story = this.storyLayer.build(event);
      this.priority.apply(story);
      this.decision.decide(story);
      stories.push(story);
    }
    for (const story of stories) {
      this.assignment.generate(story, stories);
    }
    return stories;
  }
}
