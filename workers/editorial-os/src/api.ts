/**
 * Worker API — POST /run, GET /health, GET /dashboard, GET /queue,
 * GET /history. Per the spec: "Dashboard chỉ đọc API này. Không thay
 * đổi Dashboard UI." — this router only ever exposes already-computed
 * KV state (or triggers one run through service.ts); it never renders
 * HTML and editorial-dashboard/ (Phase 7) is not modified or wired to
 * call this API in this phase.
 */
import { EditorialKvStore } from "./kv";
import { runWorkerOnce } from "./service";
import { HealthEngine } from "./worker/health";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function handleApiRequest(request: Request, kvNamespace: KVNamespace): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const store = new EditorialKvStore(kvNamespace);

  if (path === "/run" && request.method === "POST") {
    const result = await runWorkerOnce(kvNamespace);
    return json({
      ran: result.ran,
      run: result.run,
      eventsProcessed: result.run.eventsProcessed,
      draftBranches: result.draftBranches,
    });
  }

  if (path === "/health" && request.method === "GET") {
    const runs = await store.getWorkerStatus();
    const status = new HealthEngine().compute(runs);
    return json(status);
  }

  if (path === "/dashboard" && request.method === "GET") {
    const dashboard = await store.getDashboard();
    if (dashboard === null) {
      return json({ error: "Chưa có dashboard — gọi POST /run trước." }, 404);
    }
    return json(dashboard);
  }

  if (path === "/queue" && request.method === "GET") {
    const stories = await store.getQueue();
    return json(stories);
  }

  if (path === "/history" && request.method === "GET") {
    const articles = await store.getHistory();
    return json(articles);
  }

  return json({ error: "Not found" }, 404);
}
