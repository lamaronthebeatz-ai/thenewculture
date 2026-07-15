/**
 * Worker API — POST /run, GET /health, GET /dashboard, GET /queue,
 * GET /history. Per the spec: "Dashboard chỉ đọc API này. Không thay
 * đổi Dashboard UI." — this router only ever exposes already-computed
 * KV state (or triggers one run through service.ts); it never renders
 * HTML. These 5 routes' behavior (path, method, status, response body)
 * is completely unchanged by Phase 10.
 *
 * CORS: the browser dashboard (public/editorial-dashboard/) is served
 * from the Pages origin, a different origin than this Worker, so every
 * response carries Access-Control-Allow-* headers and OPTIONS
 * preflight requests get a bare 204 — headers only, no change to any
 * endpoint's routing, status logic, or response body.
 *
 * Phase 10 (Editorial Source Manager) adds one delegating branch to
 * src/source-manager/routes.ts for GET/POST/PUT/DELETE /sources[/:id]
 * — a pure extension, "Only extend." Allow-Methods widens to include
 * PUT/DELETE (needed for the browser to preflight those two new
 * methods at all); this doesn't change what the 5 existing GET/POST
 * routes accept or return.
 */
import { EditorialKvStore } from "./kv";
import { runWorkerOnce } from "./service";
import { HealthEngine } from "./worker/health";
import { handleSourceManagerRequest } from "./source-manager/routes";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

export async function handleApiRequest(request: Request, kvNamespace: KVNamespace): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const store = new EditorialKvStore(kvNamespace);

  const sourceManagerResponse = await handleSourceManagerRequest(request, kvNamespace);
  if (sourceManagerResponse !== null) return sourceManagerResponse;

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
