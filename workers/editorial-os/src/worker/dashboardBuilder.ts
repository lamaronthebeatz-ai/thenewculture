/**
 * WorkerDashboardBuilder — 1:1 port of
 * editorial-intelligence/workers/dashboard.py: builds the dashboard.json
 * payload (Pending/Ready/Writing/Review/Published/Cover Story/Top
 * Story/Issue Planning/Series Balance/Average Confidence/Average
 * Priority). Pure re-shaping of DashboardEngine/CoverStorySelector/
 * IssuePlanner (editorial.ts) + MetricsEngine (workspace.ts) — no new
 * editorial judgment logic.
 */
import { CoverStorySelector, DashboardEngine, IssuePlanner } from "../editorial";
import { EditorialDecisionType, StoryCandidate } from "../models";
import { Article, MetricsEngine } from "../workspace";

export interface IssuePlanningItem {
  title: string;
  priority: number;
  series: string | null;
}

export interface WorkerDashboard {
  pending: number;
  ready: number;
  writing: number;
  review: number;
  published: number;
  coverStory: string | null;
  topStory: string | null;
  issuePlanning: IssuePlanningItem[];
  seriesBalance: Record<string, { target: number; current: number; gap: number }>;
  averageConfidence: number | null;
  averagePriority: number | null;
}

function seriesCounts(stories: StoryCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of stories) {
    if (s.decision === EditorialDecisionType.PUBLISH && s.event.suggestedSeries) {
      counts[s.event.suggestedSeries] = (counts[s.event.suggestedSeries] ?? 0) + 1;
    }
  }
  return counts;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class WorkerDashboardBuilder {
  constructor(
    private coverStory: CoverStorySelector = new CoverStorySelector(),
    private dashboard: DashboardEngine = new DashboardEngine(),
    private issuePlanner: IssuePlanner = new IssuePlanner(),
    private metrics: MetricsEngine = new MetricsEngine(),
  ) {}

  build(stories: StoryCandidate[], articles: Article[]): WorkerDashboard {
    const dashStats = this.dashboard.compute(stories);
    const metricsResult = this.metrics.compute(articles);
    const confidences = stories.map((s) => s.event.confidence);
    const priorities = stories.map((s) => s.priorityScore);
    const coverCandidates = this.coverStory.candidates(stories, 1);
    const topStory = stories.length
      ? stories.reduce((best, s) => (s.priorityScore > best.priorityScore ? s : best))
      : null;

    const counts = seriesCounts(stories);
    const balance = this.issuePlanner.seriesBalanceReport(counts);
    const suggestions = this.issuePlanner.suggestForIssue(stories, counts, 5);

    return {
      pending: metricsResult.pending,
      ready: dashStats.published,
      writing: metricsResult.writing,
      review: metricsResult.review,
      published: metricsResult.published,
      coverStory: coverCandidates.length ? coverCandidates[0]!.event.title : null,
      topStory: topStory ? topStory.event.title : null,
      issuePlanning: suggestions.map((s) => ({
        title: s.event.title,
        priority: s.priorityScore,
        series: s.event.suggestedSeries,
      })),
      seriesBalance: balance,
      averageConfidence: mean(confidences),
      averagePriority: mean(priorities),
    };
  }
}
