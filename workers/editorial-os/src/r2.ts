/**
 * R2 storage — "draft markdown / article export / archive" per the
 * spec, as three key prefixes in one bucket (`EDITORIAL_R2`, see
 * wrangler.toml) rather than three separate buckets.
 *
 * This is infrastructure only: the Worker Flow (worker/runner.ts) never
 * writes here itself — "Không sinh bài. Worker chỉ chuẩn bị Queue."
 * Nothing in this file is called by the cron/`/run` path; these helpers
 * exist so a human (or a future, explicitly-separate tool — still not
 * this Worker) can read/write drafts, exports, and archived copies
 * through the same bucket, the same "prepare, don't perform" split
 * PromptGenerator already used for AI (never ported here — Phase 8 is
 * runtime only, per the spec's "KHÔNG thay đổi Prompt Generator").
 */

const PREFIXES = {
  draft: "drafts/",
  export: "exports/",
  archive: "archive/",
} as const;

export type R2Category = keyof typeof PREFIXES;

function keyFor(category: R2Category, id: string): string {
  return `${PREFIXES[category]}${id}`;
}

export class EditorialR2Store {
  constructor(private bucket: R2Bucket) {}

  async putDraftMarkdown(id: string, content: string): Promise<void> {
    await this.bucket.put(keyFor("draft", id), content);
  }

  async getDraftMarkdown(id: string): Promise<string | null> {
    const obj = await this.bucket.get(keyFor("draft", id));
    return obj ? await obj.text() : null;
  }

  async putArticleExport(id: string, content: string): Promise<void> {
    await this.bucket.put(keyFor("export", id), content);
  }

  async getArticleExport(id: string): Promise<string | null> {
    const obj = await this.bucket.get(keyFor("export", id));
    return obj ? await obj.text() : null;
  }

  async putArchive(id: string, content: string): Promise<void> {
    await this.bucket.put(keyFor("archive", id), content);
  }

  async getArchive(id: string): Promise<string | null> {
    const obj = await this.bucket.get(keyFor("archive", id));
    return obj ? await obj.text() : null;
  }

  async list(category: R2Category): Promise<string[]> {
    const listing = await this.bucket.list({ prefix: PREFIXES[category] });
    return listing.objects.map((o) => o.key);
  }
}
