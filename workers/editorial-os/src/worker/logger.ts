/**
 * Logger — 1:1 port of editorial-intelligence/workers/logger.py: run id /
 * start / finish / duration / events / errors.
 */

const LEVELS: Record<string, number> = { debug: 0, info: 1, warning: 2, error: 3 };

export interface RunLog {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  eventsProcessed: number;
  errors: string[];
  messages: string[];
}

export function runSuccess(run: RunLog): boolean {
  return run.finishedAt !== null && run.errors.length === 0;
}

function randomRunId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class WorkerLogger {
  private minLevel: number;

  constructor(minLevel: keyof typeof LEVELS = "info") {
    this.minLevel = LEVELS[minLevel] ?? 1;
  }

  start(): RunLog {
    return {
      runId: randomRunId(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      durationSeconds: null,
      eventsProcessed: 0,
      errors: [],
      messages: [],
    };
  }

  log(run: RunLog, message: string, level: keyof typeof LEVELS = "info"): void {
    if ((LEVELS[level] ?? 1) < this.minLevel) return;
    run.messages.push(`[${level}] ${message}`);
  }

  error(run: RunLog, message: string): void {
    run.errors.push(message);
    run.messages.push(`[error] ${message}`);
  }

  finish(run: RunLog, eventsProcessed: number): RunLog {
    run.finishedAt = new Date().toISOString();
    run.eventsProcessed = eventsProcessed;
    const started = Date.parse(run.startedAt);
    const finished = Date.parse(run.finishedAt);
    run.durationSeconds = (finished - started) / 1000;
    return run;
  }
}
