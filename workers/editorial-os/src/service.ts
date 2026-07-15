/**
 * Service — the one place that wires WorkerRunner (src/worker/runner.ts)
 * to KV persistence (src/kv.ts). Both the Cron Trigger (index.ts's
 * `scheduled()`) and `POST /run` (src/api.ts) call `runWorkerOnce()` so
 * there is exactly one code path for "do a run", matching Python's
 * scripts/editorial.py `cmd_worker_run` being the single place Phase 6's
 * WorkerRunner and Phase 4/5's JSON persistence met.
 */
import { workerConfig } from "./config";
import { EditorialKvStore } from "./kv";
import { MetricsEngine } from "./workspace";
import { WorkerLogger } from "./worker/logger";
import { WorkerRunner, WorkerRunResult } from "./worker/runner";
import { Scheduler } from "./worker/scheduler";

export async function runWorkerOnce(kvNamespace: KVNamespace): Promise<WorkerRunResult> {
  const store = new EditorialKvStore(kvNamespace);

  const runs = await store.getWorkerStatus();
  const lastRunAt = runs.length ? runs[runs.length - 1]!.startedAt : null;
  const existingArticles = await store.getHistory();

  const scheduler = new Scheduler(workerConfig.schedule.mode);
  const logger = new WorkerLogger(workerConfig.logging.level);
  const runner = new WorkerRunner({
    scheduler,
    logger,
    maxEventsPerRun: workerConfig.limits.maxEventsPerRun,
    retryMaxAttempts: workerConfig.retry.maxAttempts,
    retryBackoffSeconds: workerConfig.retry.backoffSeconds,
  });

  const result = await runner.run(lastRunAt, existingArticles);

  runs.push(result.run);
  await store.putWorkerStatus(runs);

  if (result.ran) {
    await store.putQueue(result.stories);
    await store.putHistory(result.articles);
    if (result.dashboard !== null) {
      await store.putDashboard(result.dashboard);
    }
    await store.putMetrics(new MetricsEngine().compute(result.articles));
  }

  return result;
}
