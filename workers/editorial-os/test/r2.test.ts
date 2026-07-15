/**
 * R2 tests — exercise src/r2.ts against the real Miniflare R2 binding
 * (vitest.config.ts's `miniflare.r2Buckets`). Confirms the three
 * prefixes (drafts/, exports/, archive/) stay isolated from each other.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EditorialR2Store } from "../src/r2";

describe("EditorialR2Store", () => {
  it("returns null for a draft/export/archive that doesn't exist yet", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    expect(await store.getDraftMarkdown("nope")).toBeNull();
    expect(await store.getArticleExport("nope")).toBeNull();
    expect(await store.getArchive("nope")).toBeNull();
  });

  it("putDraftMarkdown/getDraftMarkdown round-trips content", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    await store.putDraftMarkdown("abc123", "# Draft content");
    expect(await store.getDraftMarkdown("abc123")).toBe("# Draft content");
  });

  it("putArticleExport/getArticleExport round-trips content", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    await store.putArticleExport("abc123", "# Export content");
    expect(await store.getArticleExport("abc123")).toBe("# Export content");
  });

  it("putArchive/getArchive round-trips content", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    await store.putArchive("abc123", "# Archived content");
    expect(await store.getArchive("abc123")).toBe("# Archived content");
  });

  it("keeps the three prefixes isolated for the same id", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    await store.putDraftMarkdown("same-id", "draft");
    await store.putArticleExport("same-id", "export");
    await store.putArchive("same-id", "archive");

    expect(await store.getDraftMarkdown("same-id")).toBe("draft");
    expect(await store.getArticleExport("same-id")).toBe("export");
    expect(await store.getArchive("same-id")).toBe("archive");
  });

  it("list() returns keys scoped to one category's prefix", async () => {
    const store = new EditorialR2Store(env.EDITORIAL_R2!);
    await store.putDraftMarkdown("d1", "x");
    await store.putDraftMarkdown("d2", "x");
    await store.putArticleExport("e1", "x");

    const drafts = await store.list("draft");
    expect(drafts.sort()).toEqual(["drafts/d1", "drafts/d2"]);
    const exports = await store.list("export");
    expect(exports).toEqual(["exports/e1"]);
  });
});
