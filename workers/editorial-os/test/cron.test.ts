/**
 * Cron test — exercises index.ts's `scheduled()` handler directly (the
 * function Cloudflare's Cron Trigger, every 30 minutes per wrangler.toml,
 * actually calls), confirming it runs the full Worker Flow and leaves
 * KV populated exactly like `POST /run` would.
 */
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { EditorialKvStore } from "../src/kv";

function fakeScheduledController(): ScheduledController {
  return {
    scheduledTime: Date.now(),
    cron: "*/30 * * * *",
    noRetry: () => {},
  } as unknown as ScheduledController;
}

describe("scheduled() (Cron Trigger)", () => {
  it("runs the full pipeline and populates every KV key", async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(fakeScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    const store = new EditorialKvStore(env.EDITORIAL_KV);
    expect(await store.getQueue()).toHaveLength(3);
    expect(await store.getHistory()).toHaveLength(3);
    const dashboard = await store.getDashboard();
    expect(dashboard).not.toBeNull();
    expect(dashboard!.coverStory).toBe("Album Vọng Âm Ra Mắt");
    const runs = await store.getWorkerStatus();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.errors).toEqual([]);
  });

  it("a second scheduled run stays idempotent (same 3 Articles, 2 runs logged)", async () => {
    const ctx1 = createExecutionContext();
    await worker.scheduled(fakeScheduledController(), env, ctx1);
    await waitOnExecutionContext(ctx1);

    const ctx2 = createExecutionContext();
    await worker.scheduled(fakeScheduledController(), env, ctx2);
    await waitOnExecutionContext(ctx2);

    const store = new EditorialKvStore(env.EDITORIAL_KV);
    expect(await store.getHistory()).toHaveLength(3);
    expect(await store.getWorkerStatus()).toHaveLength(2);
  });
});
