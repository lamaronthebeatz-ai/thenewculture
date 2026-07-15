/**
 * Full-pipeline fidelity check: Collect -> CollectorPipeline -> Desk ->
 * Workspace -> WorkerDashboardBuilder, over the same 3 fixture events
 * Python's editorial-intelligence uses. The exact confidence/priority/
 * decision numbers asserted below were independently observed from the
 * real Python CLI in this same project (Phase 4's `editorial collect`/
 * `dashboard` output: confidences 70/4/7, average 27.0; priorities
 * 111/61/27, average 66.3; decisions PUBLISH/NEED_MORE_SOURCES/
 * NEED_MORE_SOURCES) — reproducing them here is the strongest possible
 * evidence that "Rule phải giống 100%" actually holds for this port.
 */
import { describe, expect, it } from "vitest";
import { CollectorPipeline } from "../../src/collector";
import { EditorialDesk } from "../../src/editorial";
import { EditorialDecisionType, EventStatus } from "../../src/models";
import { NewsProvider, ProviderRegistry } from "../../src/providers";
import { InMemoryEventQueue } from "../../src/queue";
import { Workspace } from "../../src/workspace";
import { WorkerDashboardBuilder } from "../../src/worker/dashboardBuilder";

describe("full pipeline over the 3 bundled fixtures", () => {
  it("matches the exact confidence/priority/decision values observed from the Python CLI", async () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider());
    const queue = new InMemoryEventQueue();
    const pipeline = new CollectorPipeline(registry, queue);
    await pipeline.run();

    const stories = new EditorialDesk().processAll(queue.all());
    expect(stories).toHaveLength(3);

    const byTitle = Object.fromEntries(stories.map((s) => [s.event.title, s]));

    const album = byTitle["Album Vọng Âm Ra Mắt"]!;
    expect(album.event.confidence).toBe(70);
    expect(album.priorityScore).toBe(111);
    expect(album.decision).toBe(EditorialDecisionType.PUBLISH);
    expect(album.event.status).toBe(EventStatus.PENDING_REVIEW);

    const single = byTitle["Bài Hát Mới Của Nghệ Sĩ B"]!;
    expect(single.event.confidence).toBe(4);
    expect(single.priorityScore).toBe(61);
    expect(single.decision).toBe(EditorialDecisionType.NEED_MORE_SOURCES);
    expect(single.event.status).toBe(EventStatus.LOW_CONFIDENCE);

    const festival = byTitle["Lễ Hội Âm Nhạc Underground 2026 Công Bố Line-up"]!;
    expect(festival.event.confidence).toBe(7);
    expect(festival.priorityScore).toBe(27);
    expect(festival.decision).toBe(EditorialDecisionType.NEED_MORE_SOURCES);
    expect(festival.event.status).toBe(EventStatus.LOW_CONFIDENCE);

    const avgConfidence = stories.reduce((sum, s) => sum + s.event.confidence, 0) / stories.length;
    const avgPriority = stories.reduce((sum, s) => sum + s.priorityScore, 0) / stories.length;
    expect(avgConfidence).toBeCloseTo(27.0, 5);
    expect(avgPriority).toBeCloseTo(66.333, 2);
  });

  it("flows through Workspace and WorkerDashboardBuilder end to end", async () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider());
    const queue = new InMemoryEventQueue();
    await new CollectorPipeline(registry, queue).run();
    const stories = new EditorialDesk().processAll(queue.all());

    const ws = new Workspace();
    for (const story of stories) ws.createArticle(story);
    const articles = ws.allArticles();
    expect(articles).toHaveLength(3);

    const dashboard = new WorkerDashboardBuilder().build(stories, articles);
    expect(dashboard.coverStory).toBe("Album Vọng Âm Ra Mắt");
    expect(dashboard.topStory).toBe("Album Vọng Âm Ra Mắt");
    expect(dashboard.ready).toBe(1); // 1 PUBLISH-decision story
    expect(dashboard.pending).toBe(3); // all 3 Articles still ArticleStatus.NEW
    expect(dashboard.averageConfidence).toBeCloseTo(27.0, 5);
    expect(dashboard.seriesBalance["tnc-records"]).toEqual({ target: 3, current: 1, gap: 2 });
  });
});
