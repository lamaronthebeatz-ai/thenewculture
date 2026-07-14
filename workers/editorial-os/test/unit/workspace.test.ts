import { describe, expect, it } from "vitest";
import { createEvent, EventType, makeStoryCandidate, StoryCandidate, StoryType } from "../../src/models";
import {
  ArchiveEngine,
  Article,
  articleId,
  ArticleStatus,
  articleTitle,
  HistoryEngine,
  InvalidTransitionError,
  makeArticle,
  MetricsEngine,
  StatusEngine,
  STATUS_ORDER,
  Workspace,
} from "../../src/workspace";

async function story(title = "Album X"): Promise<StoryCandidate> {
  const event = await createEvent({ title, artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
  event.suggestedSeries = "tnc-records"; // as EditorialMappingEngine.apply() would set for album_release
  return makeStoryCandidate(event, StoryType.RELEASE);
}

describe("StatusEngine", () => {
  it("walks the full 9-state chain in order", () => {
    const engine = new StatusEngine();
    let current: ArticleStatus = ArticleStatus.NEW;
    const seen: ArticleStatus[] = [current];
    while (engine.canAdvance(current)) {
      current = engine.nextStatus(current)!;
      seen.push(current);
    }
    expect(seen).toEqual(STATUS_ORDER);
  });

  it("rejects skipping ahead or moving backward", () => {
    const engine = new StatusEngine();
    expect(() => engine.validateTransition(ArticleStatus.NEW, ArticleStatus.WRITING)).toThrow(InvalidTransitionError);
    expect(() => engine.validateTransition(ArticleStatus.WRITING, ArticleStatus.NEW)).toThrow(InvalidTransitionError);
  });
});

describe("HistoryEngine", () => {
  it("records label/status/timestamp/note", () => {
    const history: Article["history"] = [];
    const entry = new HistoryEngine().record(history, ArticleStatus.PROMPT_READY, "note");
    expect(entry.label).toBe("Prompt Generated");
    expect(entry.note).toBe("note");
    expect(history).toEqual([entry]);
  });
});

describe("Workspace", () => {
  it("createArticle records Created history and is idempotent by id", async () => {
    const ws = new Workspace();
    const s = await story();
    const a1 = ws.createArticle(s);
    const a2 = ws.createArticle(s);
    expect(a1).toBe(a2);
    expect(ws.allArticles()).toHaveLength(1);
    expect(a1.history[0]!.label).toBe("Created");
  });

  it("find() matches by exact id and unambiguous prefix", async () => {
    const ws = new Workspace();
    const a = ws.createArticle(await story());
    expect(ws.find(articleId(a))).toBe(a);
    expect(ws.find(articleId(a).slice(0, 8))).toBe(a);
    expect(ws.find("doesnotexist")).toBeUndefined();
  });

  it("advance() moves one step and stops at PUBLISHED (ARCHIVED needs ArchiveEngine)", async () => {
    const ws = new Workspace();
    const a = ws.createArticle(await story());
    for (let i = 0; i < 7; i++) ws.advance(a);
    expect(a.status).toBe(ArticleStatus.PUBLISHED);
    expect(a.published).not.toBeNull();
    expect(() => ws.advance(a)).toThrow(InvalidTransitionError);
  });

  it("setPromptPath/setMarkdownPath/assignEditor", async () => {
    const ws = new Workspace();
    const a = ws.createArticle(await story());
    ws.setPromptPath(a, "p.txt");
    ws.setMarkdownPath(a, "d.md");
    ws.assignEditor(a, "Lam");
    expect(a.promptPath).toBe("p.txt");
    expect(a.markdownPath).toBe("d.md");
    expect(a.assignedEditor).toBe("Lam");
  });
});

describe("ArchiveEngine", () => {
  it("requires PUBLISHED status first", async () => {
    const article = makeArticle(await story());
    expect(() => new ArchiveEngine().archive(article)).toThrow(InvalidTransitionError);
  });

  it("transitions PUBLISHED -> ARCHIVED", async () => {
    const ws = new Workspace();
    const a = ws.createArticle(await story());
    for (let i = 0; i < 7; i++) ws.advance(a);
    new ArchiveEngine().archive(a, "done");
    expect(a.status).toBe(ArticleStatus.ARCHIVED);
    expect(a.history[a.history.length - 1]!.label).toBe("Archived");
  });
});

describe("MetricsEngine", () => {
  it("buckets by status and computes distributions", async () => {
    const ws = new Workspace();
    ws.createArticle(await story("A"));
    const writing = ws.createArticle(await story("B"));
    ws.advance(writing);
    ws.advance(writing);

    const metrics = new MetricsEngine().compute(ws.allArticles());
    expect(metrics.pending).toBe(1);
    expect(metrics.writing).toBe(1);
    expect(metrics.seriesDistribution["tnc-records"]).toBe(2);
    expect(metrics.storyTypeDistribution["release"]).toBe(2);
  });

  it("returns null averages when no timing data exists", () => {
    const metrics = new MetricsEngine().compute([]);
    expect(metrics.averageWritingTimeHours).toBeNull();
    expect(metrics.averageReviewTimeHours).toBeNull();
  });
});

describe("Article accessors", () => {
  it("delegate to the wrapped story/event", async () => {
    const a = makeArticle(await story("Album X"));
    expect(articleTitle(a)).toBe("Album X");
  });
});
