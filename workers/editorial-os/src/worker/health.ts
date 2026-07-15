/**
 * Health — 1:1 port of editorial-intelligence/workers/health.py: worker
 * status / last run / last success / last failure / duration / events
 * processed. Pure function over a list of RunLog entries.
 */
import { RunLog, runSuccess } from "./logger";

export interface HealthStatus {
  status: "never_run" | "ok" | "failed";
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationSeconds: number | null;
  lastEventsProcessed: number;
}

export class HealthEngine {
  compute(runs: RunLog[]): HealthStatus {
    if (runs.length === 0) {
      return {
        status: "never_run",
        lastRunAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastDurationSeconds: null,
        lastEventsProcessed: 0,
      };
    }

    const last = runs[runs.length - 1]!;
    const successes = runs.filter(runSuccess);
    const failures = runs.filter((r) => r.finishedAt !== null && r.errors.length > 0);

    return {
      status: runSuccess(last) ? "ok" : "failed",
      lastRunAt: last.startedAt,
      lastSuccessAt: successes.length ? successes[successes.length - 1]!.finishedAt : null,
      lastFailureAt: failures.length ? failures[failures.length - 1]!.finishedAt : null,
      lastDurationSeconds: last.durationSeconds,
      lastEventsProcessed: last.eventsProcessed,
    };
  }
}
