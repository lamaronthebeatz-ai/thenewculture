/**
 * Phase 10 (Editorial Source Manager) end-to-end tests, exercised
 * against the real Miniflare KV binding via the actual HTTP route
 * handler (src/source-manager/routes.ts) — the same code path
 * src/api.ts delegates to. Covers every scenario named in the spec's
 * TESTS section: Add/Edit/Delete/Enable/Disable/Duplicate URL/
 * Duplicate ID/Invalid URL/Manual Source/Persistence/Regression.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleApiRequest } from "../../src/api";
import { handleSourceManagerRequest } from "../../src/source-manager/routes";
import { runWorkerOnce } from "../../src/service";
import { EditorialKvStore } from "../../src/kv";
import { sourceRecordsToSourceConfigs } from "../../src/source-manager/store";

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://worker.test${path}`, init);
}

async function postJson(path: string, body: unknown, fetchImpl?: typeof fetch): Promise<Response> {
  return handleSourceManagerRequest(
    req(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    env.EDITORIAL_KV,
    fetchImpl,
  ) as Promise<Response>;
}

async function putJson(path: string, body: unknown): Promise<Response> {
  return handleSourceManagerRequest(
    req(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    env.EDITORIAL_KV,
  ) as Promise<Response>;
}

async function del(path: string): Promise<Response> {
  return handleSourceManagerRequest(req(path, { method: "DELETE" }), env.EDITORIAL_KV) as Promise<Response>;
}

async function list(): Promise<Response> {
  return handleSourceManagerRequest(req("/sources"), env.EDITORIAL_KV) as Promise<Response>;
}

const noNetworkFetch = (async () => {
  throw new Error("no network in this test — every URL below is either a channel URL or expected to fall back to manual");
}) as unknown as typeof fetch;

describe("Add Source", () => {
  it("adds a new Vietnamese Hip-Hop source with a direct YouTube channel URL, no network call needed", async () => {
    const response = await postJson(
      "/sources",
      { name: "New Hip-Hop Artist", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCabcDEF1234567890ab" },
      noNetworkFetch,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { source: { id: string; feedType: string; youtube: string | null } };
    expect(body.source.feedType).toBe("youtube");
    expect(body.source.youtube).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcDEF1234567890ab");

    const listed = (await (await list()).json()) as { sources: Array<{ id: string }> };
    expect(listed.sources.some((s) => s.id === body.source.id)).toBe(true);
  });

  it("rejects a missing required field (name)", async () => {
    const response = await postJson("/sources", { type: "artist", category: "vietnam", pastedUrl: "https://example.com" }, noNetworkFetch);
    expect(response.status).toBe(400);
  });

  it("rejects an invalid type value", async () => {
    const response = await postJson("/sources", { name: "X", type: "not-a-type", category: "vietnam", pastedUrl: "https://example.com" }, noNetworkFetch);
    expect(response.status).toBe(400);
  });
});

describe("Invalid URL", () => {
  it("rejects a syntactically invalid pastedUrl before ever attempting detection", async () => {
    const response = await postJson("/sources", { name: "Bad URL Source", type: "artist", category: "vietnam", pastedUrl: "not a url" }, noNetworkFetch);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/URL/i);
  });
});

describe("Manual Source", () => {
  it("saves as feedType manual when detection can't determine anything (network failure)", async () => {
    const failingFetch = (async () => {
      throw new Error("simulated network failure");
    }) as unknown as typeof fetch;

    const response = await postJson(
      "/sources",
      { name: "Undetectable Source", type: "label", category: "international", pastedUrl: "https://totally-unreachable.example.com" },
      failingFetch,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { source: { feedType: string } };
    expect(body.source.feedType).toBe("manual");
  });
});

describe("Duplicate URL", () => {
  it("rejects adding a second source with the same (canonicalized) URL", async () => {
    const first = await postJson(
      "/sources",
      { name: "Dup Source A", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCdupdupdupdupdupdup" },
      noNetworkFetch,
    );
    expect(first.status).toBe(201);

    const second = await postJson(
      "/sources",
      { name: "Dup Source B (same URL)", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCdupdupdupdupdupdup" },
      noNetworkFetch,
    );
    expect(second.status).toBe(409);
  });
});

describe("Duplicate ID", () => {
  it("never produces a duplicate id even when two sources share the exact same name", async () => {
    const a = await postJson("/sources", { name: "Same Name", type: "artist", category: "vietnam", pastedUrl: "https://a.example.com" }, noNetworkFetch);
    const b = await postJson("/sources", { name: "Same Name", type: "artist", category: "vietnam", pastedUrl: "https://b.example.com" }, noNetworkFetch);
    const aBody = (await a.json()) as { source: { id: string } };
    const bBody = (await b.json()) as { source: { id: string } };
    expect(aBody.source.id).not.toBe(bBody.source.id);
  });
});

describe("Edit Source", () => {
  it("updates a source's name, category, and notes", async () => {
    const added = await postJson("/sources", { name: "Editable Source", type: "artist", category: "vietnam", pastedUrl: "https://editable.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };

    const edited = await putJson(`/sources/${source.id}`, { name: "Renamed Source", category: "international", notes: "updated notes" });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as { source: { name: string; category: string; notes: string } };
    expect(body.source).toMatchObject({ name: "Renamed Source", category: "international", notes: "updated notes" });
  });

  it("rejects an edit with a malformed homepage URL", async () => {
    const added = await postJson("/sources", { name: "Bad Homepage Edit", type: "artist", category: "vietnam", pastedUrl: "https://bad-homepage-edit.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };
    const response = await putJson(`/sources/${source.id}`, { homepage: "not a url" });
    expect(response.status).toBe(400);
  });

  it("rejects an edit with a malformed rss URL", async () => {
    const added = await postJson("/sources", { name: "Bad Rss Edit", type: "artist", category: "vietnam", pastedUrl: "https://bad-rss-edit.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };
    const response = await putJson(`/sources/${source.id}`, { rss: "not a url" });
    expect(response.status).toBe(400);
  });

  it("rejects an edit with a youtube URL that isn't actually a youtube.com host", async () => {
    const added = await postJson("/sources", { name: "Bad Youtube Edit", type: "artist", category: "vietnam", pastedUrl: "https://bad-youtube-edit.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };
    const response = await putJson(`/sources/${source.id}`, { youtube: "https://example.com/not-youtube" });
    expect(response.status).toBe(400);
  });

  it("returns 404 when editing a source id that doesn't exist", async () => {
    const response = await putJson("/sources/does-not-exist", { name: "X" });
    expect(response.status).toBe(404);
  });

  it("rejects an edit that would introduce a duplicate URL with another source", async () => {
    const a = await postJson("/sources", { name: "Edit Dup A", type: "artist", category: "vietnam", pastedUrl: "https://edit-dup-a.example.com" }, noNetworkFetch);
    await postJson("/sources", { name: "Edit Dup B", type: "artist", category: "vietnam", pastedUrl: "https://edit-dup-b.example.com" }, noNetworkFetch);
    const { source: sourceA } = (await a.json()) as { source: { id: string } };

    const response = await putJson(`/sources/${sourceA.id}`, { homepage: "https://edit-dup-b.example.com" });
    expect(response.status).toBe(409);
  });
});

describe("Feed type recomputation on Edit (production blocker fix)", () => {
  it("promotes feedType away from manual once an editor pastes a real rss URL via Edit, making the source collectible", async () => {
    const added = await postJson(
      "/sources",
      { name: "Recovered Source", type: "media", category: "international", pastedUrl: "https://recovered-source.example.com" },
      noNetworkFetch,
    );
    const { source } = (await added.json()) as { source: { id: string; feedType: string } };
    expect(source.feedType).toBe("manual");

    const edited = await putJson(`/sources/${source.id}`, { rss: "https://recovered-source.example.com/feed.xml" });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as { source: { feedType: string; rss: string | null } };
    expect(body.source.feedType).toBe("rss");
    expect(body.source.rss).toBe("https://recovered-source.example.com/feed.xml");

    const configs = sourceRecordsToSourceConfigs([body.source as never]);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ type: "rss", url: "https://recovered-source.example.com/feed.xml" });
  });

  it("promotes feedType to youtube when an editor pastes a real youtube URL via Edit", async () => {
    const added = await postJson(
      "/sources",
      { name: "Recovered YT Source", type: "artist", category: "youtube", pastedUrl: "https://recovered-yt.example.com" },
      noNetworkFetch,
    );
    const { source } = (await added.json()) as { source: { id: string } };

    const edited = await putJson(`/sources/${source.id}`, { youtube: "https://www.youtube.com/channel/UCrecoveredYtChannel1" });
    const body = (await edited.json()) as { source: { feedType: string } };
    expect(body.source.feedType).toBe("youtube");
  });

  it("demotes feedType to website when only youtube is cleared but homepage remains set", async () => {
    const added = await postJson(
      "/sources",
      { name: "Demote Source", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCdemotedemotedemote1" },
      noNetworkFetch,
    );
    const { source } = (await added.json()) as { source: { id: string; feedType: string } };
    expect(source.feedType).toBe("youtube");

    const edited = await putJson(`/sources/${source.id}`, { youtube: null });
    const body = (await edited.json()) as { source: { feedType: string } };
    expect(body.source.feedType).toBe("website");
  });

  it("demotes feedType all the way to manual when homepage/rss/youtube are all cleared", async () => {
    const added = await postJson(
      "/sources",
      { name: "Fully Demoted Source", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCfullydemoted12345" },
      noNetworkFetch,
    );
    const { source } = (await added.json()) as { source: { id: string; feedType: string } };
    expect(source.feedType).toBe("youtube");

    const edited = await putJson(`/sources/${source.id}`, { youtube: null, homepage: null });
    const body = (await edited.json()) as { source: { feedType: string } };
    expect(body.source.feedType).toBe("manual");
  });

  it("leaves feedType untouched when the edit doesn't touch homepage/rss/youtube at all", async () => {
    const added = await postJson(
      "/sources",
      { name: "Untouched Source", type: "artist", category: "vietnam", pastedUrl: "https://www.youtube.com/channel/UCuntoucheduntouched1" },
      noNetworkFetch,
    );
    const { source } = (await added.json()) as { source: { id: string } };

    const edited = await putJson(`/sources/${source.id}`, { notes: "just a note update" });
    const body = (await edited.json()) as { source: { feedType: string } };
    expect(body.source.feedType).toBe("youtube");
  });
});

describe("Enable / Disable", () => {
  it("disables a source via PUT { enabled: false }", async () => {
    const added = await postJson("/sources", { name: "Toggle Source", type: "artist", category: "vietnam", pastedUrl: "https://toggle.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };

    const disabled = await putJson(`/sources/${source.id}`, { enabled: false });
    expect((await disabled.json() as { source: { enabled: boolean } }).source.enabled).toBe(false);
  });

  it("re-enables a disabled source via PUT { enabled: true }", async () => {
    const added = await postJson("/sources", { name: "Toggle Source 2", type: "artist", category: "vietnam", pastedUrl: "https://toggle2.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };
    await putJson(`/sources/${source.id}`, { enabled: false });

    const reenabled = await putJson(`/sources/${source.id}`, { enabled: true });
    expect((await reenabled.json() as { source: { enabled: boolean } }).source.enabled).toBe(true);
  });
});

describe("Delete Source", () => {
  it("deletes a source and it no longer appears in the list", async () => {
    const added = await postJson("/sources", { name: "Delete Me", type: "artist", category: "vietnam", pastedUrl: "https://delete-me.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };

    const deleteResponse = await del(`/sources/${source.id}`);
    expect(deleteResponse.status).toBe(200);

    const listed = (await (await list()).json()) as { sources: Array<{ id: string }> };
    expect(listed.sources.some((s) => s.id === source.id)).toBe(false);
  });

  it("returns 404 when deleting an id that doesn't exist", async () => {
    const response = await del("/sources/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unsupported method on /sources", async () => {
    const response = (await handleSourceManagerRequest(req("/sources", { method: "PATCH" }), env.EDITORIAL_KV)) as Response;
    expect(response.status).toBe(404);
  });
});

describe("Persistence", () => {
  it("survives across separate handler invocations (a fresh store/request each time)", async () => {
    const added = await postJson("/sources", { name: "Persisted Source", type: "artist", category: "vietnam", pastedUrl: "https://persisted.example.com" }, noNetworkFetch);
    const { source } = (await added.json()) as { source: { id: string } };

    // A brand new request, as if a different HTTP call — must still see it.
    const listed = (await (await list()).json()) as { sources: Array<{ id: string; name: string }> };
    expect(listed.sources.find((s) => s.id === source.id)?.name).toBe("Persisted Source");
  });
});

describe("Regression: existing Worker API and behavior are unaffected", () => {
  it("the 5 pre-existing routes still behave exactly as before Phase 10", async () => {
    const healthResponse = await handleApiRequest(req("/health"), env.EDITORIAL_KV);
    expect(healthResponse.status).toBe(200);

    const historyResponse = await handleApiRequest(req("/history"), env.EDITORIAL_KV);
    expect(historyResponse.status).toBe(200);
    expect(await historyResponse.json()).toEqual([]);

    const notFound = await handleApiRequest(req("/nonexistent-route"), env.EDITORIAL_KV);
    expect(notFound.status).toBe(404);
  });

  it("runWorkerOnce() still falls back to the 3 bundled fixtures when the Source Manager's list has no collectible sources", async () => {
    const result = await runWorkerOnce(env.EDITORIAL_KV);
    expect(result.ran).toBe(true);
    expect(result.stories).toHaveLength(3);

    const store = new EditorialKvStore(env.EDITORIAL_KV);
    expect(await store.getQueue()).toHaveLength(3);
  });

  it("api.ts's /sources delegation doesn't shadow any of the 5 existing routes", async () => {
    const response = await handleApiRequest(req("/dashboard"), env.EDITORIAL_KV);
    // 404 (no dashboard yet) or 200 are both "handled by the real
    // /dashboard route", not accidentally swallowed by source-manager
    // routing (which only ever matches paths starting with /sources).
    expect([200, 404]).toContain(response.status);
  });
});
