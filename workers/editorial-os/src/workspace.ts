/**
 * Workspace — 1:1 port of editorial-intelligence/workspace/{status,
 * history,article,workspace,archive,metrics}.py (Phase 5).
 */
import { StoryCandidate, storyId } from "./models";

// =======================================================================
// status.py
// =======================================================================

export enum ArticleStatus {
  NEW = "new",
  PENDING_REVIEW = "pending_review",
  PROMPT_READY = "prompt_ready",
  WRITING = "writing",
  DRAFT_READY = "draft_ready",
  EDITOR_REVIEW = "editor_review",
  READY_TO_PUBLISH = "ready_to_publish",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export const STATUS_ORDER: ArticleStatus[] = [
  ArticleStatus.NEW,
  ArticleStatus.PENDING_REVIEW,
  ArticleStatus.PROMPT_READY,
  ArticleStatus.WRITING,
  ArticleStatus.DRAFT_READY,
  ArticleStatus.EDITOR_REVIEW,
  ArticleStatus.READY_TO_PUBLISH,
  ArticleStatus.PUBLISHED,
  ArticleStatus.ARCHIVED,
];

export const TRANSITION_LABELS: Record<ArticleStatus, string> = {
  [ArticleStatus.NEW]: "Created",
  [ArticleStatus.PENDING_REVIEW]: "Queued for Review",
  [ArticleStatus.PROMPT_READY]: "Prompt Generated",
  [ArticleStatus.WRITING]: "Writing Started",
  [ArticleStatus.DRAFT_READY]: "Draft Generated",
  [ArticleStatus.EDITOR_REVIEW]: "Sent to Editor Review",
  [ArticleStatus.READY_TO_PUBLISH]: "Reviewed",
  [ArticleStatus.PUBLISHED]: "Published",
  [ArticleStatus.ARCHIVED]: "Archived",
};

export class InvalidTransitionError extends Error {}

export class StatusEngine {
  nextStatus(current: ArticleStatus): ArticleStatus | null {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx + 1 >= STATUS_ORDER.length) return null;
    return STATUS_ORDER[idx + 1]!;
  }

  canAdvance(current: ArticleStatus): boolean {
    return this.nextStatus(current) !== null;
  }

  validateTransition(current: ArticleStatus, target: ArticleStatus): void {
    const expected = this.nextStatus(current);
    if (target !== expected) {
      const expectedLabel = expected ?? "(none — already ARCHIVED)";
      throw new InvalidTransitionError(
        `Cannot move from ${current} to ${target}; next valid status is ${expectedLabel}.`,
      );
    }
  }
}

// =======================================================================
// history.py
// =======================================================================

export function nowIso(): string {
  return new Date().toISOString();
}

export interface HistoryEntry {
  label: string;
  status: string;
  timestamp: string;
  note: string | null;
}

export class HistoryEngine {
  record(history: HistoryEntry[], status: ArticleStatus, note: string | null = null): HistoryEntry {
    const entry: HistoryEntry = {
      label: TRANSITION_LABELS[status],
      status,
      timestamp: nowIso(),
      note,
    };
    history.push(entry);
    return entry;
  }
}

// =======================================================================
// article.py
// =======================================================================

export interface Article {
  story: StoryCandidate;
  status: ArticleStatus;
  assignedEditor: string | null;
  promptPath: string | null;
  markdownPath: string | null;
  created: string;
  updated: string;
  published: string | null;
  history: HistoryEntry[];
}

export function makeArticle(story: StoryCandidate, assignedEditor: string | null = null): Article {
  return {
    story,
    status: ArticleStatus.NEW,
    assignedEditor,
    promptPath: null,
    markdownPath: null,
    created: "",
    updated: "",
    published: null,
    history: [],
  };
}

export function articleId(article: Article): string {
  return storyId(article.story);
}

export function articleTitle(article: Article): string {
  return article.story.event.title;
}

export function articleSeries(article: Article): string | null {
  return article.story.event.suggestedSeries;
}

export function articlePriority(article: Article): number {
  return article.story.priorityScore;
}

// =======================================================================
// workspace.py
// =======================================================================

export class Workspace {
  private status: StatusEngine;
  private history: HistoryEngine;
  private articles: Article[];

  constructor(articles: Article[] = [], statusEngine?: StatusEngine, historyEngine?: HistoryEngine) {
    this.status = statusEngine ?? new StatusEngine();
    this.history = historyEngine ?? new HistoryEngine();
    this.articles = [...articles];
  }

  allArticles(): Article[] {
    return [...this.articles];
  }

  find(idOrPrefix: string): Article | undefined {
    for (const a of this.articles) {
      if (articleId(a) === idOrPrefix) return a;
    }
    const matches = this.articles.filter((a) => articleId(a).startsWith(idOrPrefix));
    return matches.length === 1 ? matches[0] : undefined;
  }

  /** Idempotent: returns the existing Article if `story.event.id` is
   * already tracked, instead of creating a duplicate. */
  createArticle(story: StoryCandidate, assignedEditor: string | null = null): Article {
    const existing = this.find(story.event.id);
    if (existing !== undefined) return existing;

    const timestamp = nowIso();
    const article = makeArticle(story, assignedEditor);
    article.created = timestamp;
    article.updated = timestamp;
    this.history.record(article.history, ArticleStatus.NEW);
    this.articles.push(article);
    return article;
  }

  /** Moves `article` one step forward per STATUS_ORDER. Stops at
   * PUBLISHED — PUBLISHED -> ARCHIVED is ArchiveEngine's job. */
  advance(article: Article, note: string | null = null): Article {
    const target = this.status.nextStatus(article.status);
    if (target === null || target === ArticleStatus.ARCHIVED) {
      throw new InvalidTransitionError(
        "Đã đến bước cuối của quy trình sản xuất — dùng `editorial archive` để lưu trữ.",
      );
    }
    this.status.validateTransition(article.status, target);
    article.status = target;
    this.history.record(article.history, target, note);
    article.updated = nowIso();
    if (target === ArticleStatus.PUBLISHED) {
      article.published = article.updated;
    }
    return article;
  }

  setPromptPath(article: Article, path: string): void {
    article.promptPath = path;
    article.updated = nowIso();
  }

  setMarkdownPath(article: Article, path: string): void {
    article.markdownPath = path;
    article.updated = nowIso();
  }

  assignEditor(article: Article, editor: string): void {
    article.assignedEditor = editor;
    article.updated = nowIso();
  }
}

// =======================================================================
// archive.py
// =======================================================================

export class ArchiveEngine {
  private history: HistoryEngine;

  constructor(historyEngine?: HistoryEngine) {
    this.history = historyEngine ?? new HistoryEngine();
  }

  archive(article: Article, note: string | null = null): Article {
    if (article.status !== ArticleStatus.PUBLISHED) {
      throw new InvalidTransitionError(
        `Chỉ có thể Archive một Article đã PUBLISHED (hiện tại: ${article.status}).`,
      );
    }
    article.status = ArticleStatus.ARCHIVED;
    this.history.record(article.history, ArticleStatus.ARCHIVED, note);
    article.updated = nowIso();
    return article;
  }
}

// =======================================================================
// metrics.py
// =======================================================================

export interface WorkspaceMetrics {
  pending: number;
  writing: number;
  review: number;
  published: number;
  averageWritingTimeHours: number | null;
  averageReviewTimeHours: number | null;
  seriesDistribution: Record<string, number>;
  storyTypeDistribution: Record<string, number>;
}

function findEntry(history: HistoryEntry[], status: ArticleStatus): HistoryEntry | undefined {
  const label = TRANSITION_LABELS[status];
  return history.find((entry) => entry.label === label);
}

function hoursBetween(start: string, end: string): number | null {
  const t0 = Date.parse(start);
  const t1 = Date.parse(end);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return (t1 - t0) / 1000 / 3600;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export class MetricsEngine {
  compute(articles: Article[]): WorkspaceMetrics {
    const pending = articles.filter(
      (a) => a.status === ArticleStatus.NEW || a.status === ArticleStatus.PENDING_REVIEW,
    ).length;
    const writing = articles.filter(
      (a) => a.status === ArticleStatus.PROMPT_READY || a.status === ArticleStatus.WRITING,
    ).length;
    const review = articles.filter(
      (a) =>
        a.status === ArticleStatus.DRAFT_READY ||
        a.status === ArticleStatus.EDITOR_REVIEW ||
        a.status === ArticleStatus.READY_TO_PUBLISH,
    ).length;
    const published = articles.filter(
      (a) => a.status === ArticleStatus.PUBLISHED || a.status === ArticleStatus.ARCHIVED,
    ).length;

    const writingTimes: number[] = [];
    const reviewTimes: number[] = [];
    for (const a of articles) {
      const startWriting = findEntry(a.history, ArticleStatus.WRITING);
      const draftReady = findEntry(a.history, ArticleStatus.DRAFT_READY);
      if (startWriting && draftReady) {
        const hours = hoursBetween(startWriting.timestamp, draftReady.timestamp);
        if (hours !== null) writingTimes.push(hours);
      }

      const editorReview = findEntry(a.history, ArticleStatus.EDITOR_REVIEW);
      const readyToPublish = findEntry(a.history, ArticleStatus.READY_TO_PUBLISH);
      if (editorReview && readyToPublish) {
        const hours = hoursBetween(editorReview.timestamp, readyToPublish.timestamp);
        if (hours !== null) reviewTimes.push(hours);
      }
    }

    const seriesDistribution: Record<string, number> = {};
    const storyTypeDistribution: Record<string, number> = {};
    for (const a of articles) {
      const key = articleSeries(a) ?? "(chưa xác định)";
      seriesDistribution[key] = (seriesDistribution[key] ?? 0) + 1;
      const storyType = a.story.storyType;
      storyTypeDistribution[storyType] = (storyTypeDistribution[storyType] ?? 0) + 1;
    }

    return {
      pending,
      writing,
      review,
      published,
      averageWritingTimeHours: mean(writingTimes),
      averageReviewTimeHours: mean(reviewTimes),
      seriesDistribution,
      storyTypeDistribution,
    };
  }
}
