import { describe, expect, it } from "vitest";
import { CoverStorySelector, DashboardEngine, IssuePlanner } from "../../src/editorial";
import { createEvent, EditorialDecisionType, EventType, makeStoryCandidate, StoryType } from "../../src/models";
import { MetricsEngine, Workspace } from "../../src/workspace";
import { WorkerDashboardBuilder } from "../../src/worker/dashboardBuilder";
import { HealthEngine } from "../../src/worker/health";
import { WorkerLogger } from "../../src/worker/logger";
import { Scheduler } from "../../src/worker/scheduler";
import { WorkerRunner } from "../../src/worker/runner";

describe("Scheduler", () => {
  it("manual mode is always due", () => {
    expect(new Scheduler("manual").isDue(null)).toBe(true);
    expect(new Scheduler("manual").isDue(new Date().toISOString())).toBe(true);
  });

  it("hourly mode respects the interval", () => {
    const scheduler = new Scheduler("hourly");
    const now = new Date("2026-01-01T12:00:00Z");
    expect(scheduler.isDue(new Date("2026-01-01T11:30:00Z").toISOString(), now)).toBe(false);
    expect(scheduler.isDue(new Date("2026-01-01T10:00:00Z").toISOString(), now)).toBe(true);
  });

  it("throws for an unknown mode", () => {
    // @ts-expect-error deliberately invalid
    expect(() => new Scheduler("biweekly")).toThrow();
  });
});

describe("WorkerLogger", () => {
  it("start/finish computes duration and events processed", () => {
    const logger = new WorkerLogger();
    const run = logger.start();
    logger.finish(run, 3);
    expect(run.finishedAt).not.toBeNull();
    expect(run.eventsProcessed).toBe(3);
    expect(run.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("error() marks the run unsuccessful", () => {
    const logger = new WorkerLogger();
    const run = logger.start();
    logger.error(run, "boom");
    logger.finish(run, 0);
    expect(run.errors).toEqual(["boom"]);
  });

  it("filters messages below min level", () => {
    const logger = new WorkerLogger("warning");
    const run = logger.start();
    logger.log(run, "info msg", "info");
    logger.log(run, "warn msg", "warning");
    expect(run.messages).toEqual(["[warning] warn msg"]);
  });
});

describe("HealthEngine", () => {
  it("never_run with no runs", () => {
    expect(new HealthEngine().compute([]).status).toBe("never_run");
  });

  it("ok after a successful run, failed after an error run", () => {
    const logger = new WorkerLogger();
    const ok = logger.start();
    logger.finish(ok, 1);
    const failed = logger.start();
    logger.error(failed, "boom");
    logger.finish(failed, 0);

    const status = new HealthEngine().compute([ok, failed]);
    expect(status.status).toBe("failed"); // last run is the failed one
    expect(status.lastSuccessAt).toBe(ok.finishedAt);
    expect(status.lastFailureAt).toBe(failed.finishedAt);
  });
});

describe("WorkerDashboardBuilder", () => {
  it("builds an empty-pool dashboard", () => {
    const result = new WorkerDashboardBuilder(new CoverStorySelector(), new DashboardEngine(), new IssuePlanner(), new MetricsEngine()).build([], []);
    expect(result.pending).toBe(0);
    expect(result.coverStory).toBeNull();
    expect(result.averageConfidence).toBeNull();
  });

  it("reports topStory and averages over a populated pool", async () => {
    const eA = await createEvent({ title: "A", artist: "X", eventType: EventType.ALBUM_RELEASE, description: "d" });
    eA.confidence = 80;
    const sA = makeStoryCandidate(eA, StoryType.RELEASE);
    sA.priorityScore = 90;

    const eB = await createEvent({ title: "B", artist: "Y", eventType: EventType.ALBUM_RELEASE, description: "d" });
    eB.confidence = 20;
    const sB = makeStoryCandidate(eB, StoryType.RELEASE);
    sB.priorityScore = 10;

    const ws = new Workspace();
    ws.createArticle(sA);
    ws.createArticle(sB);

    const result = new WorkerDashboardBuilder().build([sA, sB], ws.allArticles());
    expect(result.topStory).toBe("A");
    expect(result.averageConfidence).toBe(50);
    expect(result.averagePriority).toBe(50);
  });

  it("ready counts PUBLISH-decision stories, distinct from Workspace published", async () => {
    const event = await createEvent({ title: "A", artist: "X", eventType: EventType.ALBUM_RELEASE, description: "d" });
    const story = makeStoryCandidate(event, StoryType.RELEASE);
    story.decision = EditorialDecisionType.PUBLISH;
    const result = new WorkerDashboardBuilder().build([story], []);
    expect(result.ready).toBe(1);
    expect(result.published).toBe(0); // no Article reached ArticleStatus.PUBLISHED
  });
});

describe("WorkerRunner", () => {
  it("skips the run when the schedule says not due", async () => {
    const runner = new WorkerRunner({ scheduler: new Scheduler("hourly") });
    const result = await runner.run(new Date().toISOString());
    expect(result.ran).toBe(false);
    expect(result.stories).toEqual([]);
  });

  it("runs the full pipeline over the bundled fixtures", async () => {
    const runner = new WorkerRunner();
    const result = await runner.run();
    expect(result.ran).toBe(true);
    expect(result.stories).toHaveLength(3);
    expect(result.articles).toHaveLength(3);
    expect(result.dashboard).not.toBeNull();
    expect(result.draftBranches).toHaveLength(3);
    expect(result.draftBranches.every((b) => b.startsWith("draft/"))).toBe(true);
    expect(result.run.errors).toEqual([]);
  });

  it("respects maxEventsPerRun", async () => {
    const runner = new WorkerRunner({ maxEventsPerRun: 1 });
    const result = await runner.run();
    expect(result.stories).toHaveLength(1);
  });

  it("is idempotent across runs given the same existingArticles", async () => {
    const runner = new WorkerRunner();
    const first = await runner.run();
    const second = await runner.run(null, first.articles);
    expect(second.articles).toHaveLength(3);
    expect(new Set(second.articles.map((a) => a.story.event.id))).toEqual(
      new Set(first.articles.map((a) => a.story.event.id)),
    );
  });

  it("retries on failure and recovers", async () => {
    let calls = 0;
    const runner = new WorkerRunner({ retryMaxAttempts: 2, retryBackoffSeconds: 0, sleepFn: async () => {} });
    const original = (runner as unknown as { collectAndProcess: (a: unknown[]) => Promise<unknown> })["collectAndProcess"];
    (runner as unknown as { collectAndProcess: (a: unknown[]) => Promise<unknown> })["collectAndProcess"] = async (
      articles: unknown[],
    ) => {
      calls += 1;
      if (calls === 1) throw new Error("simulated failure");
      return original.call(runner, articles);
    };

    const result = await runner.run();
    expect(result.ran).toBe(true);
    expect(result.stories).toHaveLength(3);
    expect(result.run.errors).toHaveLength(1);
  });

  it("gives up after exhausting retries", async () => {
    const runner = new WorkerRunner({ retryMaxAttempts: 2, retryBackoffSeconds: 0, sleepFn: async () => {} });
    (runner as unknown as { collectAndProcess: () => Promise<unknown> })["collectAndProcess"] = async () => {
      throw new Error("always broken");
    };

    const result = await runner.run();
    expect(result.ran).toBe(true);
    expect(result.stories).toEqual([]);
    expect(result.dashboard).toBeNull();
    expect(result.run.errors).toHaveLength(2);
  });
});
