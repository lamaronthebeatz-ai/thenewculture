/**
 * SourceManagerStore tests — exercise the real Miniflare KV binding
 * (see vitest.config.ts's miniflare.kvNamespaces), same pattern as
 * test/kv.test.ts.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EditorialKvStore } from "../../../src/kv";
import { SourceManagerStore, buildSeedSourceRecords, sourceRecordsToSourceConfigs } from "../../../src/source-manager/store";
import { SourceRecord } from "../../../src/source-manager/types";

function newStore(): SourceManagerStore {
  return new SourceManagerStore(new EditorialKvStore(env.EDITORIAL_KV));
}

function makeRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  const now = new Date().toISOString();
  return {
    id: "test-source",
    name: "Test Source",
    type: "artist",
    category: "vietnam",
    homepage: null,
    rss: "https://example.com/feed.xml",
    youtube: null,
    feedType: "rss",
    enabled: true,
    status: "unknown",
    verified: false,
    verifiedAt: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SourceManagerStore", () => {
  it("seeds from editorial-config on first list(), persisting the seed to KV", async () => {
    const store = newStore();
    const kv = new EditorialKvStore(env.EDITORIAL_KV);

    expect(await kv.getSources()).toBeNull(); // never seeded yet
    const listed = await store.list();
    expect(listed).toEqual(buildSeedSourceRecords(listed[0]?.createdAt ?? new Date().toISOString()));
    expect(await kv.getSources()).not.toBeNull(); // now persisted
  });

  it("add() appends a record and persists it", async () => {
    const store = newStore();
    await store.list(); // trigger seeding first
    const before = await store.list();
    const updated = await store.add(makeRecord({ id: "new-1" }));
    expect(updated).toHaveLength(before.length + 1);
    expect(updated.find((s) => s.id === "new-1")).toBeTruthy();

    const reloaded = await store.list();
    expect(reloaded.find((s) => s.id === "new-1")).toBeTruthy();
  });

  it("update() patches a record in place and bumps updatedAt", async () => {
    const store = newStore();
    await store.add(makeRecord({ id: "to-edit", name: "Old Name" }));
    const updated = await store.update("to-edit", { name: "New Name" });
    expect(updated).not.toBeNull();
    const record = updated!.find((s) => s.id === "to-edit")!;
    expect(record.name).toBe("New Name");
    expect(record.updatedAt).not.toBe(record.createdAt);
  });

  it("update() returns null for an unknown id", async () => {
    const store = newStore();
    await store.list();
    expect(await store.update("does-not-exist", { name: "x" })).toBeNull();
  });

  it("remove() deletes a record and persists the removal", async () => {
    const store = newStore();
    await store.add(makeRecord({ id: "to-delete" }));
    const updated = await store.remove("to-delete");
    expect(updated).not.toBeNull();
    expect(updated!.find((s) => s.id === "to-delete")).toBeUndefined();

    const reloaded = await store.list();
    expect(reloaded.find((s) => s.id === "to-delete")).toBeUndefined();
  });

  it("remove() returns null for an unknown id", async () => {
    const store = newStore();
    await store.list();
    expect(await store.remove("does-not-exist")).toBeNull();
  });

  it("persists an explicitly-emptied list as [] rather than re-seeding on the next read", async () => {
    const store = newStore();
    const kv = new EditorialKvStore(env.EDITORIAL_KV);
    await store.list(); // seed
    const seeded = await store.list();
    for (const record of seeded) {
      await store.remove(record.id);
    }
    expect(await kv.getSources()).toEqual([]);
    expect(await store.list()).toEqual([]); // stays empty, does not re-seed
  });
});

describe("sourceRecordsToSourceConfigs", () => {
  it("produces a SourceConfig for an rss-feedType record", () => {
    const configs = sourceRecordsToSourceConfigs([makeRecord({ feedType: "rss", rss: "https://example.com/feed.xml" })]);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ type: "rss", url: "https://example.com/feed.xml" });
  });

  it("produces zero SourceConfigs for a manual-feedType record even if rss/youtube happen to be set", () => {
    const configs = sourceRecordsToSourceConfigs([
      makeRecord({ feedType: "manual", rss: "https://example.com/feed.xml", youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=X" }),
    ]);
    expect(configs).toEqual([]);
  });

  it("produces zero SourceConfigs for a website-feedType record", () => {
    const configs = sourceRecordsToSourceConfigs([makeRecord({ feedType: "website", rss: null, youtube: null, homepage: "https://example.com" })]);
    expect(configs).toEqual([]);
  });

  it("produces zero SourceConfigs for a disabled record", () => {
    const configs = sourceRecordsToSourceConfigs([makeRecord({ feedType: "rss", enabled: false })]);
    expect(configs).toEqual([]);
  });
});
