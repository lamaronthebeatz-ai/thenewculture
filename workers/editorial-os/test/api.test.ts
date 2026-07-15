/**
 * API tests — exercise the real fetch() handler (index.ts) through
 * `SELF.fetch()`, the Workers test pool's way of sending an actual HTTP
 * request into the worker under test, over the real KV binding.
 */
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Worker API", () => {
  it("GET /health before any run reports never_run", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "never_run" });
  });

  it("GET /dashboard before any run returns 404", async () => {
    const res = await SELF.fetch("https://example.com/dashboard");
    expect(res.status).toBe(404);
  });

  it("GET /queue and /history before any run return []", async () => {
    expect(await (await SELF.fetch("https://example.com/queue")).json()).toEqual([]);
    expect(await (await SELF.fetch("https://example.com/history")).json()).toEqual([]);
  });

  it("POST /run executes the pipeline and subsequent GETs reflect it", async () => {
    const runRes = await SELF.fetch("https://example.com/run", { method: "POST" });
    expect(runRes.status).toBe(200);
    const runBody = (await runRes.json()) as { ran: boolean; eventsProcessed: number; draftBranches: string[] };
    expect(runBody.ran).toBe(true);
    expect(runBody.eventsProcessed).toBe(3);
    expect(runBody.draftBranches).toHaveLength(3);

    const health = await (await SELF.fetch("https://example.com/health")).json();
    expect(health).toMatchObject({ status: "ok", lastEventsProcessed: 3 });

    const dashboard = (await (await SELF.fetch("https://example.com/dashboard")).json()) as { coverStory: string | null };
    expect(dashboard.coverStory).toBe("Album Vọng Âm Ra Mắt");

    const queue = await (await SELF.fetch("https://example.com/queue")).json();
    expect(queue).toHaveLength(3);

    const history = await (await SELF.fetch("https://example.com/history")).json();
    expect(history).toHaveLength(3);
  });

  it("GET on an unknown path returns 404", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });

  it("GET /run (wrong method) returns 404 — POST only", async () => {
    const res = await SELF.fetch("https://example.com/run");
    expect(res.status).toBe(404);
  });

  it("every JSON response carries CORS headers for the browser dashboard", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("OPTIONS preflight returns 204 with CORS headers and no body", async () => {
    const res = await SELF.fetch("https://example.com/run", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.text()).toBe("");
  });
});
