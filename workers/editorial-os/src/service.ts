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
 *     (`news.payloads.length > 0`) — not merely when SOURCE_CONFIG is
 *     non-empty. The Editorial Source Registry (PR #39,
 *     collectors/sources.ts) ships every entry with `url: null` until a
 *     feed is verified, so as long as every configured source stays
 *     NOT_CONFIGURED (or simply fails), this function's behavior stays
 *     byte-for-byte identical to before this feature: WorkerRunner
 *     falls back to its own default bundled fixture events, exactly as
 *     it always has.
 *   - The `dashboard` KV value gains one new, namespaced field
 *     (`newsCollector`) with Collector Health + collected/accepted/
 *     rejected/duplicates/topStory/newestStory/lastCrawlAt — every
 *     existing field on that object is untouched, and kv.ts/api.ts/
 *     worker/dashboardBuilder.ts are never modified to do this (see
 *     collectors/health.ts's docstring for why this isn't a 6th KV key).
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
import { SOURCE_CONFIG } from "./collectors/sources";

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
  sources: SourceConfig[] = SOURCE_CONFIG,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkerRunResult> {
  const store = new EditorialKvStore(kvNamespace);

  const runs = await store.getWorkerStatus();
  const lastRunAt = runs.length ? runs[runs.length - 1]!.startedAt : null;
  const existingArticles = await store.getHistory();

  const news = await collectAllNews(sources, fetchImpl);

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
    // registry is non-empty. The Editorial Source Registry (PR #39)
    // ships with every entry's `url: null` until a feed is verified
    // (see sources.ts), so `sources.length > 0` alone would wrongly
    // suppress the bundled fixtures the moment a NOT_CONFIGURED entry
    // is added, producing zero events per run instead of falling back.
    // Checking `news.payloads.length` keeps the Worker producing its
    // existing bundled events for as long as collection yields nothing
    // real — the "runtime must continue normally even if every source
    // is NOT_CONFIGURED" requirement.
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
          collectorHealth: news.health,
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
