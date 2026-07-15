/**
 * Scheduler — 1:1 port of editorial-intelligence/workers/scheduler.py.
 *
 * Kept for rule-fidelity with Python's manual/hourly/daily/weekly
 * vocabulary and its `isDue()` gate — in the Phase 8 deployment, the
 * actual firing schedule is Cloudflare's own Cron Trigger (every 30
 * minutes, see the `crons` entry in wrangler.toml), so this class's role here is the
 * same defensive check Python's `WorkerRunner.run()` already performed
 * before doing any work, not a replacement for the Cron Trigger itself.
 */

export type ScheduleMode = "manual" | "hourly" | "daily" | "weekly";

const INTERVALS_MS: Record<Exclude<ScheduleMode, "manual">, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const MODES: ScheduleMode[] = ["manual", "hourly", "daily", "weekly"];

export class Scheduler {
  readonly mode: ScheduleMode;

  constructor(mode: ScheduleMode = "manual") {
    if (!MODES.includes(mode)) {
      throw new Error(`Unknown schedule mode: ${JSON.stringify(mode)} (expected one of ${MODES.join(", ")})`);
    }
    this.mode = mode;
  }

  /** `manual` is always due. hourly/daily/weekly are due only if no run
   * has happened yet, or the interval has elapsed since the last one. */
  isDue(lastRunAt: string | null, now: Date = new Date()): boolean {
    if (this.mode === "manual") return true;
    if (lastRunAt === null) return true;
    const last = Date.parse(lastRunAt);
    return now.getTime() - last >= INTERVALS_MS[this.mode];
  }
}
