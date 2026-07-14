/**
 * Editorial OS Cloudflare Runtime (Phase 8) — entrypoint.
 *
 * Architecture (per the spec):
 *   Cloudflare Cron Trigger -> Worker Runtime -> Collector -> Normalize
 *   -> Validate -> Duplicate -> Confidence -> Editorial Queue ->
 *   Workspace -> Dashboard JSON -> Dashboard UI
 *
 * `scheduled()` fires on the Cron Trigger (every 30 minutes, see the
 * `crons` entry in wrangler.toml) and runs the exact same code path
 * `POST /run` does — both call
 * service.ts's `runWorkerOnce()`, which is the only place business logic
 * (collector.ts/editorial.ts/workspace.ts — all unchanged rules from
 * Phase 1-6) meets KV persistence.
 */
import { handleApiRequest } from "./api";
import { runWorkerOnce } from "./service";

export interface Env {
  EDITORIAL_KV: KVNamespace;
  EDITORIAL_R2: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleApiRequest(request, env.EDITORIAL_KV);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runWorkerOnce(env.EDITORIAL_KV));
  },
};
