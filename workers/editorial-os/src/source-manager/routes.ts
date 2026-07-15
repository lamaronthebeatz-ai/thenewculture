/**
 * Source Manager — HTTP routes (Phase 10). GET/POST/PUT/DELETE
 * /sources[/:id], delegated to from src/api.ts with a single branch —
 * the 5 pre-existing routes (POST /run, GET /health|/dashboard|/queue|
 * /history) are untouched, so "API behavior" for them is unchanged.
 *
 * This is the only HTTP surface editors need: add/edit/enable/disable/
 * delete all happen here, persisted straight to KV (see store.ts) —
 * "Editors never touch YAML. Editors never touch Git. Editors never
 * redeploy."
 */
import { EditorialKvStore } from "../kv";
import { ENTITY_TYPES, EntityType, FEED_TYPES, NewSourceInput, SourceRecord, SourceUpdateInput } from "./types";
import { SourceCategory } from "../collectors/base";
import { SourceStatus } from "../config-loader/types";
import { SourceManagerStore } from "./store";
import { detectSource, FetchImpl } from "./detection";
import { findDuplicateByUrl, generateUniqueId, isValidHttpUrl, isValidFeedUrlFormat, isValidYoutubeUrlFormat } from "./validation";

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

const CATEGORIES: readonly SourceCategory[] = ["international", "vietnam", "youtube", "community"];
const STATUSES: readonly SourceStatus[] = ["supported", "not_supported", "unknown"];

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && (ENTITY_TYPES as readonly string[]).includes(value);
}

function isCategory(value: unknown): value is SourceCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleAddSource(request: Request, store: SourceManagerStore, fetchImpl: FetchImpl): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return json({ error: "Body JSON không hợp lệ." }, 400);

  const input = body as Partial<NewSourceInput>;
  if (!input.name || typeof input.name !== "string" || !input.name.trim()) {
    return json({ error: "Thiếu trường bắt buộc: name" }, 400);
  }
  if (!input.type || !isEntityType(input.type)) {
    return json({ error: `Trường type không hợp lệ — phải là một trong: ${ENTITY_TYPES.join(", ")}` }, 400);
  }
  if (!input.category || !isCategory(input.category)) {
    return json({ error: `Trường category không hợp lệ — phải là một trong: ${CATEGORIES.join(", ")}` }, 400);
  }
  if (!input.pastedUrl || typeof input.pastedUrl !== "string") {
    return json({ error: "Thiếu trường bắt buộc: pastedUrl" }, 400);
  }
  if (!isValidHttpUrl(input.pastedUrl)) {
    return json({ error: "URL không hợp lệ." }, 400);
  }

  const existing = await store.list();
  const duplicate = findDuplicateByUrl(existing, [input.pastedUrl]);
  if (duplicate) {
    return json({ error: `Nguồn này đã tồn tại: "${duplicate.name}" (id: ${duplicate.id})` }, 409);
  }

  const detection = await detectSource(input.pastedUrl, fetchImpl);
  const now = new Date().toISOString();
  const record: SourceRecord = {
    id: generateUniqueId(input.name, existing),
    name: input.name.trim(),
    type: input.type,
    category: input.category,
    homepage: detection.homepage,
    rss: detection.rss,
    youtube: detection.youtube,
    feedType: detection.feedType,
    enabled: true,
    status: "unknown",
    verified: false,
    verifiedAt: null,
    notes: typeof input.notes === "string" ? input.notes : detection.reason,
    createdAt: now,
    updatedAt: now,
  };

  const updated = await store.add(record);
  return json({ source: record, sources: updated }, 201);
}

async function handleUpdateSource(id: string, request: Request, store: SourceManagerStore): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return json({ error: "Body JSON không hợp lệ." }, 400);

  const patch = body as SourceUpdateInput;
  if (patch.type !== undefined && !isEntityType(patch.type)) {
    return json({ error: `Trường type không hợp lệ — phải là một trong: ${ENTITY_TYPES.join(", ")}` }, 400);
  }
  if (patch.category !== undefined && !isCategory(patch.category)) {
    return json({ error: `Trường category không hợp lệ — phải là một trong: ${CATEGORIES.join(", ")}` }, 400);
  }
  if (patch.status !== undefined && !(STATUSES as readonly string[]).includes(patch.status)) {
    return json({ error: `Trường status không hợp lệ — phải là một trong: ${STATUSES.join(", ")}` }, 400);
  }
  if (patch.homepage !== undefined && patch.homepage !== null && !isValidHttpUrl(patch.homepage)) {
    return json({ error: "homepage không hợp lệ." }, 400);
  }
  if (patch.rss !== undefined && patch.rss !== null && !isValidFeedUrlFormat(patch.rss)) {
    return json({ error: "rss không hợp lệ." }, 400);
  }
  if (patch.youtube !== undefined && patch.youtube !== null && !isValidYoutubeUrlFormat(patch.youtube)) {
    return json({ error: "youtube không hợp lệ — phải là URL youtube.com." }, 400);
  }

  const existing = await store.list();
  const candidateUrls = [patch.homepage, patch.rss, patch.youtube].filter((u) => u !== undefined) as Array<string | null>;
  if (candidateUrls.length > 0) {
    const duplicate = findDuplicateByUrl(
      existing.filter((s) => s.id !== id),
      candidateUrls,
    );
    if (duplicate) {
      return json({ error: `URL này đã thuộc về nguồn khác: "${duplicate.name}" (id: ${duplicate.id})` }, 409);
    }
  }

  const updated = await store.update(id, patch);
  if (updated === null) return json({ error: `Không tìm thấy nguồn với id "${id}"` }, 404);
  return json({ source: updated.find((s) => s.id === id), sources: updated });
}

async function handleDeleteSource(id: string, store: SourceManagerStore): Promise<Response> {
  const updated = await store.remove(id);
  if (updated === null) return json({ error: `Không tìm thấy nguồn với id "${id}"` }, 404);
  return json({ sources: updated });
}

/** Returns null when the path isn't under /sources at all, so
 * src/api.ts can fall through to its existing routes/404 unchanged. */
export async function handleSourceManagerRequest(
  request: Request,
  kvNamespace: KVNamespace,
  fetchImpl: FetchImpl = fetch,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/sources")) return null;

  const store = new SourceManagerStore(new EditorialKvStore(kvNamespace));
  const idMatch = path.match(/^\/sources\/([^/]+)\/?$/);

  if (path === "/sources" && request.method === "GET") {
    return json({ sources: await store.list(), entityTypes: ENTITY_TYPES, feedTypes: FEED_TYPES });
  }
  if (path === "/sources" && request.method === "POST") {
    return handleAddSource(request, store, fetchImpl);
  }
  if (idMatch && request.method === "PUT") {
    return handleUpdateSource(decodeURIComponent(idMatch[1]!), request, store);
  }
  if (idMatch && request.method === "DELETE") {
    return handleDeleteSource(decodeURIComponent(idMatch[1]!), store);
  }

  return json({ error: "Not found" }, 404);
}
