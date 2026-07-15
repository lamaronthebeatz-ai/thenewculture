/**
 * KV persistence — Phase 8's equivalent of Python's CLI-only JSON state
 * files (scripts/editorial.py: stories.json, articles.json,
 * worker_runs.json, dashboard.json). One KV namespace (`EDITORIAL_KV`,
 * see wrangler.toml), five original fixed keys:
 *
 *   "queue"          -> StoryCandidate[]   (≈ Python's stories.json)
 *   "history"        -> Article[]          (≈ Python's articles.json —
 *                        named "history" because each Article's own
 *                        History timeline is what this key exists to
 *                        carry across runs/requests)
 *   "worker-status"  -> RunLog[]           (≈ Python's worker_runs.json)
 *   "dashboard"      -> WorkerDashboard    (≈ Python's dashboard.json)
 *   "metrics"        -> WorkspaceMetrics   (Phase 5's MetricsEngine
 *                        output alone, a narrower view than "dashboard")
 *
 * Unlike Python's `_stringify_enums()`/`dataclasses.asdict()` dance,
 * TypeScript enums already serialize to plain strings, so JSON.stringify/
 * JSON.parse round-trip every shape below with no custom encoding step —
 * one genuine simplification the runtime port gets for free.
 *
 * Phase 10 (Editorial Source Manager) adds a 6th key:
 *
 *   "sources"        -> SourceRecord[] | null (null = never seeded yet;
 *                        [] = seeded, editor has since deleted every
 *                        source — see src/source-manager/store.ts)
 *
 * This is the live runtime source of truth for editorial sources once
 * the Source Manager exists, letting editors add/edit/delete sources
 * from the Dashboard with no redeploy — none of the 5 original keys or
 * their shapes change.
 */
import { StoryCandidate } from "./models";
import { WorkerDashboard } from "./worker/dashboardBuilder";
import { RunLog } from "./worker/logger";
import { Article } from "./workspace";
import { WorkspaceMetrics } from "./workspace";
import { SourceRecord } from "./source-manager/types";

export const KV_KEYS = {
  queue: "queue",
  history: "history",
  workerStatus: "worker-status",
  dashboard: "dashboard",
  metrics: "metrics",
  sources: "sources",
} as const;

export class EditorialKvStore {
  constructor(private kv: KVNamespace) {}

  async getQueue(): Promise<StoryCandidate[]> {
    return (await this.kv.get<StoryCandidate[]>(KV_KEYS.queue, "json")) ?? [];
  }

  async putQueue(stories: StoryCandidate[]): Promise<void> {
    await this.kv.put(KV_KEYS.queue, JSON.stringify(stories));
  }

  async getHistory(): Promise<Article[]> {
    return (await this.kv.get<Article[]>(KV_KEYS.history, "json")) ?? [];
  }

  async putHistory(articles: Article[]): Promise<void> {
    await this.kv.put(KV_KEYS.history, JSON.stringify(articles));
  }

  async getWorkerStatus(): Promise<RunLog[]> {
    return (await this.kv.get<RunLog[]>(KV_KEYS.workerStatus, "json")) ?? [];
  }

  async putWorkerStatus(runs: RunLog[]): Promise<void> {
    await this.kv.put(KV_KEYS.workerStatus, JSON.stringify(runs));
  }

  async getDashboard(): Promise<WorkerDashboard | null> {
    return await this.kv.get<WorkerDashboard>(KV_KEYS.dashboard, "json");
  }

  async putDashboard(dashboard: WorkerDashboard): Promise<void> {
    await this.kv.put(KV_KEYS.dashboard, JSON.stringify(dashboard));
  }

  async getMetrics(): Promise<WorkspaceMetrics | null> {
    return await this.kv.get<WorkspaceMetrics>(KV_KEYS.metrics, "json");
  }

  async putMetrics(metrics: WorkspaceMetrics): Promise<void> {
    await this.kv.put(KV_KEYS.metrics, JSON.stringify(metrics));
  }

  /** null means "never seeded yet" — distinct from `[]`, which means
   * the source list was seeded and an editor has since deleted every
   * source. See src/source-manager/store.ts's SourceManagerStore. */
  async getSources(): Promise<SourceRecord[] | null> {
    return await this.kv.get<SourceRecord[]>(KV_KEYS.sources, "json");
  }

  async putSources(sources: SourceRecord[]): Promise<void> {
    await this.kv.put(KV_KEYS.sources, JSON.stringify(sources));
  }
}
