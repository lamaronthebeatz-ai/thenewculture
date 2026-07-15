/**
 * WorkerRunner — 1:1 port of editorial-intelligence/workers/worker.py,
 * implementing the same 8 Worker Responsibilities:
 *   1. Schedule    (scheduler.ts's Scheduler.isDue)
 *   2-4. Collect Sources / CollectorPipeline / EditorialDesk (reused,
 *        unchanged rules — collector.ts, editorial.ts)
 *   5. Update Workspace (reused, unchanged rules — workspace.ts)
 *   6. Generate Dashboard JSON (dashboardBuilder.ts)
 *   7. Create Draft Branch nếu có event mới (computed branch names only
 *      — no git/network call, same as Python's worker.py)
 *   8. Dừng.
 *
 * Two runtime-forced adaptations from Python's worker.py, both purely
 * about *where state lives between runs*, never about *what the rules
 * are*:
 *   - `run()` takes `existingArticles` as a parameter and returns the
 *     updated list, instead of the CLI reading/writing a local JSON
 *     file — Phase 8's caller (index.ts's scheduled()/POST /run) reads
 *     that list from KV before calling run() and writes the result back
 *     to KV after, same read-then-write shape Python's
 *     scripts/editorial.py `cmd_worker_run` already used, just KV
 *     instead of a file.
 *   - Event/StoryCandidate construction is async (see models.ts —
 *     SHA-256 via Web Crypto), so this whole file is async where
 *     Python's is not.
 *
 * No AI/OpenAI/Claude/Prompt/Markdown/Publish/Merge/Push-Main call
 * anywhere in this file, matching Python's worker.py exactly.
 */
import { CollectorPipeline } from "../collector";
import { EditorialDesk } from "../editorial";
import { StoryCandidate } from "../models";
import { NewsProvider, ProviderRegistry, RawPayload } from "../providers";
import { InMemoryEventQueue } from "../queue";
import { Article, ArticleStatus, Workspace } from "../workspace";
import { WorkerDashboard, WorkerDashboardBuilder } from "./dashboardBuilder";
import { RunLog, WorkerLogger } from "./logger";
import { Scheduler } from "./scheduler";

export interface WorkerRunResult {
  run: RunLog;
  ran: boolean;
  stories: StoryCandidate[];
  articles: Article[];
  dashboard: WorkerDashboard | null;
  draftBranches: string[];
}

export interface WorkerRunnerOptions {
  fixtures?: RawPayload[];
  scheduler?: Scheduler;
  logger?: WorkerLogger;
  dashboardBuilder?: WorkerDashboardBuilder;
  maxEventsPerRun?: number;
  retryMaxAttempts?: number;
  retryBackoffSeconds?: number;
  sleepFn?: (seconds: number) => Promise<void>;
}

const defaultSleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export class WorkerRunner {
  private fixtures?: RawPayload[];
  private scheduler: Scheduler;
  private logger: WorkerLogger;
  private dashboardBuilder: WorkerDashboardBuilder;
  private maxEventsPerRun: number | undefined;
  private retryMaxAttempts: number;
  private retryBackoffSeconds: number;
  private sleepFn: (seconds: number) => Promise<void>;

  constructor(options: WorkerRunnerOptions = {}) {
    this.fixtures = options.fixtures;
    this.scheduler = options.scheduler ?? new Scheduler();
    this.logger = options.logger ?? new WorkerLogger();
    this.dashboardBuilder = options.dashboardBuilder ?? new WorkerDashboardBuilder();
    this.maxEventsPerRun = options.maxEventsPerRun;
    this.retryMaxAttempts = Math.max(1, options.retryMaxAttempts ?? 1);
    this.retryBackoffSeconds = options.retryBackoffSeconds ?? 0;
    this.sleepFn = options.sleepFn ?? defaultSleep;
  }

  async run(lastRunAt: string | null = null, existingArticles: Article[] = []): Promise<WorkerRunResult> {
    const run = this.logger.start();

    if (!this.scheduler.isDue(lastRunAt)) {
      this.logger.log(run, `Skipped — schedule mode '${this.scheduler.mode}' not due yet.`);
      this.logger.finish(run, 0);
      return { run, ran: false, stories: [], articles: [], dashboard: null, draftBranches: [] };
    }

    let stories: StoryCandidate[] | undefined;
    let workspace: Workspace | undefined;
    let attempt = 0;
    while (attempt < this.retryMaxAttempts) {
      attempt += 1;
      try {
        const result = await this.collectAndProcess(existingArticles);
        stories = result.stories;
        workspace = result.workspace;
        break;
      } catch (exc) {
        this.logger.error(run, `Attempt ${attempt} failed: ${exc instanceof Error ? exc.message : String(exc)}`);
        if (attempt < this.retryMaxAttempts) {
          await this.sleepFn(this.retryBackoffSeconds);
        }
      }
    }

    if (stories === undefined || workspace === undefined) {
      this.logger.finish(run, 0);
      return { run, ran: true, stories: [], articles: [], dashboard: null, draftBranches: [] };
    }

    if (this.maxEventsPerRun !== undefined) {
      stories = stories.slice(0, this.maxEventsPerRun);
    }

    const articles = workspace.allArticles();
    const draftBranches = articles
      .filter((a) => a.status === ArticleStatus.NEW)
      .map((a) => `draft/${a.story.event.id.slice(0, 8)}`);

    const dashboard = this.dashboardBuilder.build(stories, articles);
    this.logger.log(run, `Processed ${stories.length} stories, ${draftBranches.length} new draft branch(es).`);
    this.logger.finish(run, stories.length);

    return { run, ran: true, stories, articles, dashboard, draftBranches };
  }

  private async collectAndProcess(
    existingArticles: Article[],
  ): Promise<{ stories: StoryCandidate[]; workspace: Workspace }> {
    const provider = new NewsProvider(this.fixtures);
    const registry = new ProviderRegistry();
    registry.register(provider);
    const queue = new InMemoryEventQueue();
    const pipeline = new CollectorPipeline(registry, queue); // Phase 1, unchanged rules
    await pipeline.run();

    const stories = new EditorialDesk().processAll(queue.all()); // Phase 3, unchanged rules

    const workspace = new Workspace(existingArticles);
    for (const story of stories) {
      workspace.createArticle(story); // Phase 5, unchanged rules — idempotent by id
    }
    return { stories, workspace };
  }
}
