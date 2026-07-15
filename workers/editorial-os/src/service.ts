/**
 * Service — the one place that wires WorkerRunner (src/worker/runner.ts)
 * to KV persistence (src/kv.ts). Both the Cron Trigger (index.ts's
 * `scheduled()`) and `POST /run` (src/api.ts) call `runWorkerOnce()` so
 * there is exactly one code path for "do a run", matching Python's
 * scripts/editorial.py `cmd_worker_run` being the single place Phase 6's
 * WorkerRunner and Phase 4/5's JSON persistence met.
 *
 * Phase 8 (News Intelligence Collector) additions, both additive only:
 *   - Before building the WorkerRunner, real sources (src/collectors/)
 *     are collected/deduped/scored/filtered/sorted into RawPayload[]
 *     and handed to WorkerRunner via its *already-existing* `fixtures`
 *     option — collector.ts, providers.ts and worker/runner.ts are
 *     never touched. `fixtures` only overrides the bundled defaults
 *     once collection actually yields at least one accepted story
 *     (`news.payloads.length > 0`) — not merely when the source list is
 *     non-empty, so the Worker keeps falling back to its bundled
 *     fixture events for as long as every configured source stays
 *     unconfigured/failing (the "runtime must continue normally"
 *     requirement).
 *   - The `dashboard` KV value gains one new, namespaced field
 *     (`newsCollector`) with Collector Health + collected/accepted/
 *     rejected/duplicates/topStory/newestStory/lastCrawlAt — every
 *     existing field on that object is untouched, and kv.ts/api.ts/
 *     worker/dashboardBuilder.ts are never modified to do this (see
 *     collectors/health.ts's docstring for why this isn't a 6th KV key).
 *
 * PR #41 (Registry Runtime Integration) additions:
 *   - The default source list is no longer collectors/sources.ts's
 *     static `SOURCE_CONFIG` — it's now loaded from
 *     editorial-config/sources.yaml (PR #40) via
 *     src/config-loader/factory.ts's loadSourceConfigFromYaml(), which
 *     validates the file and never throws (a malformed row becomes a
 *     "config_error" Collector Health entry instead of stopping the
 *     run — "No source may crash Worker"). This only applies when the
 *     caller doesn't pass an explicit `sources` argument; tests keep
 *     injecting their own synthetic SourceConfig[] exactly as before.
 *     CollectorPipeline, EditorialDesk, Workspace, Queue, Dashboard,
 *     WorkerRunner, HealthEngine, api.ts, and kv.ts are untouched.
 */
import { workerConfig } from "./config";
import { EditorialKvStore } from "./kv";
import { MetricsEngine } from "./workspace";
import { WorkerDashboard } from "./worker/dashboardBuilder";
import { WorkerLogger } from "./worker/logger";
import { WorkerRunner, WorkerRunResult } from "./worker/runner";
import { Scheduler } from "./worker/scheduler";
import { SourceConfig } from "./collectors/base";
import { CollectorHealthEntry } from "./collectors/health";
import { collectAllNews, NewsStorySummary } from "./collectors/registry";
import { loadSourceConfigFromYaml } from "./config-loader/factory";
import { EMBEDDED_SOURCES_YAML } from "./config-loader/embeddedSourcesYaml.generated";

export interface NewsCollectorDashboardStats {
  collectorHealth: CollectorHealthEntry[];
  collected: number;
  accepted: number;
  rejected: number;
  duplicatesRemoved: number;
  topStory: NewsStorySummary | null;
  newestStory: NewsStorySummary | null;
  lastCrawlAt: string;
}

export type EnrichedWorkerDashboard = WorkerDashboard & { newsCollector: NewsCollectorDashboardStats };

export async function runWorkerOnce(
  kvNamespace: KVNamespace,
  sources?: SourceConfig[],
  fetchImpl: typeof fetch = fetch,
): Promise<WorkerRunResult> {
  const store = new EditorialKvStore(kvNamespace);

  const runs = await store.getWorkerStatus();
  const lastRunAt = runs.length ? runs[runs.length - 1]!.startedAt : null;
  const existingArticles = await store.getHistory();

  // `sources` is only ever explicitly passed by tests, injecting their
  // own synthetic SourceConfig[]. The Worker's real default is to load
  // editorial-config/sources.yaml at startup (PR #41) — config errors
  // from that file only ever apply to *this* path, since an explicit
  // `sources` override means editorial-config wasn't even consulted
  // for this run.
  const usingEditorialConfig = sources === undefined;
  const { sources: loadedSources, configErrorHealth } = usingEditorialConfig
    ? loadSourceConfigFromYaml(EMBEDDED_SOURCES_YAML)
    : { sources: [], configErrorHealth: [] };
  const effectiveSources = sources ?? loadedSources;

  const news = await collectAllNews(effectiveSources, fetchImpl);

  const scheduler = new Scheduler(workerConfig.schedule.mode);
  const logger = new WorkerLogger(workerConfig.logging.level);
  const runner = new WorkerRunner({
    scheduler,
    logger,
    maxEventsPerRun: workerConfig.limits.maxEventsPerRun,
    retryMaxAttempts: workerConfig.retry.maxAttempts,
    retryBackoffSeconds: workerConfig.retry.backoffSeconds,
    // Only override the default bundled fixtures once real news has
    // actually been collected and accepted — not merely when the
    // effective source list is non-empty. Checking `news.payloads.length`
    // keeps the Worker producing its existing bundled events for as
    // long as collection yields nothing real (every configured source
    // stays unconfigured, disabled, or failing) — the "runtime must
    // continue normally" requirement.
    ...(news.payloads.length > 0 ? { fixtures: news.payloads } : {}),
  });

  const result = await runner.run(lastRunAt, existingArticles);

  runs.push(result.run);
  await store.putWorkerStatus(runs);

  if (result.ran) {
    await store.putQueue(result.stories);
    await store.putHistory(result.articles);
    if (result.dashboard !== null) {
      const enrichedDashboard: EnrichedWorkerDashboard = {
        ...result.dashboard,
        newsCollector: {
          collectorHealth: [...news.health, ...configErrorHealth],
          collected: news.collected,
          accepted: news.accepted,
          rejected: news.rejected,
          duplicatesRemoved: news.duplicatesRemoved,
          topStory: news.topStory,
          newestStory: news.newestStory,
          lastCrawlAt: news.lastCrawlAt,
        },
      };
      await store.putDashboard(enrichedDashboard);
    }
    await store.putMetrics(new MetricsEngine().compute(result.articles));
  }

  return result;
}
