/**
 * Collector Health (Phase 8). Per spec: "Each source stores Status /
 * Healthy / Timeout / 404 / Parsing Error / Disabled / Last Success /
 * Last Failure / Response Time / Items Collected / Retry Count."
 *
 * Editorial Source Registry (PR #39) adds "NOT_CONFIGURED": a source
 * with `url: null` is reported this way instead of as a failure — it
 * was never attempted, so it gets neither a lastSuccess nor a
 * lastFailure timestamp, same treatment as "disabled".
 *
 * This is computed fresh from the current run's CollectorFetchResult[]
 * (see registry.ts) — it is NOT persisted to its own KV key, since "KV
 * schema must remain identical" (still exactly 5 keys: queue, history,
 * worker-status, dashboard, metrics). service.ts attaches this run's
 * health snapshot onto the existing `dashboard` KV value instead of
 * introducing a 6th key, so Collector Health reflects the most recent
 * collection attempt rather than a persisted history across runs.
 */
import { CollectorFetchResult, CollectorHealthStatus, SourceConfig } from "./base";

export interface CollectorHealthEntry {
  sourceId: string;
  sourceName: string;
  status: CollectorHealthStatus;
  lastSuccess: string | null;
  lastFailure: string | null;
  responseTimeMs: number | null;
  itemsCollected: number;
  retryCount: number;
}

export class CollectorHealthTracker {
  /** Builds one health entry per configured source: disabled sources
   * are reported as "disabled" without being fetched at all; enabled
   * sources use their CollectorFetchResult from this run. */
  build(sources: SourceConfig[], results: Map<string, CollectorFetchResult>, now: string = new Date().toISOString()): CollectorHealthEntry[] {
    return sources.map((source) => {
      if (!source.enabled) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "disabled",
          lastSuccess: null,
          lastFailure: null,
          responseTimeMs: null,
          itemsCollected: 0,
          retryCount: 0,
        };
      }

      const result = results.get(source.id);
      if (!result) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "http_error",
          lastSuccess: null,
          lastFailure: now,
          responseTimeMs: null,
          itemsCollected: 0,
          retryCount: 0,
        };
      }

      const healthy = result.status === "healthy";
      // "not_configured" (no url set) was never attempted — it's
      // neither a success nor a failure, so neither timestamp is set.
      const notConfigured = result.status === "not_configured";
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: result.status,
        lastSuccess: healthy ? now : null,
        lastFailure: !healthy && !notConfigured ? now : null,
        responseTimeMs: result.responseTimeMs,
        itemsCollected: result.items.length,
        retryCount: result.retryCount,
      };
    });
  }
}
