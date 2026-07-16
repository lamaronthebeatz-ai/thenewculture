/**
 * Source Manager — persistence (Phase 10). KV (via EditorialKvStore's
 * new `sources` key) is the live runtime source of truth once the
 * Source Manager exists — not editorial-config/sources.yaml, and not
 * any TypeScript literal ("Do not store source definitions inside
 * TypeScript. Editorial Configuration remains the single source of
 * truth."). The YAML file's embedded snapshot only ever seeds KV the
 * very first time it's read; every add/edit/delete after that is a
 * plain KV read-modify-write, needing no code change or redeploy.
 */
import { EditorialKvStore } from "../kv";
import { parseSourcesYaml } from "../config-loader/loader";
import { validateSourcesDocument } from "../config-loader/validator";
import { validatedEntryToSourceConfigs } from "../config-loader/factory";
import { EMBEDDED_SOURCES_YAML } from "../config-loader/embeddedSourcesYaml.generated";
import { ValidatedSourceEntry } from "../config-loader/types";
import { SourceConfig } from "../collectors/base";
import { EntityType, FeedType, SourceRecord } from "./types";

function feedTypeForSeedEntry(entry: ValidatedSourceEntry): FeedType {
  if (entry.youtube !== null) return "youtube";
  if (entry.rss !== null) return "rss";
  if (entry.homepage !== null) return "website";
  return "manual";
}

/** Best-effort default entity type for rows migrated from the
 * pre-Source-Manager registry, which had no entity-type concept — an
 * editor can correct this via Edit Source at any time. */
function entityTypeForCategory(category: ValidatedSourceEntry["category"]): EntityType {
  if (category === "youtube") return "artist";
  if (category === "community") return "community";
  return "media";
}

function seedRecordFromEntry(entry: ValidatedSourceEntry, now: string): SourceRecord {
  return {
    id: entry.id,
    name: entry.name,
    type: entityTypeForCategory(entry.category),
    category: entry.category,
    homepage: entry.homepage,
    rss: entry.rss,
    youtube: entry.youtube,
    feedType: feedTypeForSeedEntry(entry),
    enabled: entry.enabled,
    status: entry.status,
    verified: false,
    verifiedAt: null,
    notes: entry.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

/** Parses+validates the embedded editorial-config/sources.yaml
 * snapshot into SourceRecord[] — a malformed row is silently dropped
 * here exactly as config-loader already treats it (as a ConfigError,
 * surfaced separately on Collector Health), never thrown. */
export function buildSeedSourceRecords(now: string = new Date().toISOString()): SourceRecord[] {
  const { rawEntries, documentError } = parseSourcesYaml(EMBEDDED_SOURCES_YAML);
  if (documentError) return [];
  const { validEntries } = validateSourcesDocument(rawEntries);
  return validEntries.map((entry) => seedRecordFromEntry(entry, now));
}

/** Converts the live source list into the SourceConfig[] the existing,
 * unmodified collector engine (collectors/registry.ts's
 * collectAllNews()) already consumes — reusing config-loader's own
 * validatedEntryToSourceConfigs() unchanged. `feedType: "manual"` and
 * `"website"` sources never produce a collector (no automated
 * collection — matches "If detection fails -> Save as Manual", and
 * Phase 8's still-standing "no website scraping" boundary). Editing a
 * source's homepage/rss/youtube via Edit Source (source-manager/
 * routes.ts's handleUpdateSource) recomputes feedType from the result,
 * so a source only ever stays "manual"/"website" here for as long as it
 * genuinely has no confirmed rss/youtube URL. */
export function sourceRecordsToSourceConfigs(records: SourceRecord[]): SourceConfig[] {
  return records.flatMap((record) => {
    const collectible = record.feedType === "rss" || record.feedType === "atom" || record.feedType === "youtube";
    const entry: ValidatedSourceEntry = {
      id: record.id,
      name: record.name,
      category: record.category,
      enabled: record.enabled,
      status: record.status,
      homepage: record.homepage,
      rss: collectible ? record.rss : null,
      youtube: collectible ? record.youtube : null,
      notes: record.notes,
    };
    return validatedEntryToSourceConfigs(entry);
  });
}

export class SourceManagerStore {
  constructor(private kv: EditorialKvStore) {}

  /** Returns the live source list, seeding it from the embedded
   * editorial-config snapshot the first time it's ever read (KV has no
   * `sources` key at all yet — distinct from "initialized but the
   * editor deleted everything", which stays an empty array forever). */
  async list(): Promise<SourceRecord[]> {
    const existing = await this.kv.getSources();
    if (existing !== null) return existing;
    const seeded = buildSeedSourceRecords();
    await this.kv.putSources(seeded);
    return seeded;
  }

  async add(record: SourceRecord): Promise<SourceRecord[]> {
    const current = await this.list();
    const updated = [...current, record];
    await this.kv.putSources(updated);
    return updated;
  }

  async update(id: string, patch: Partial<Omit<SourceRecord, "id" | "createdAt">>): Promise<SourceRecord[] | null> {
    const current = await this.list();
    const index = current.findIndex((s) => s.id === id);
    if (index === -1) return null;
    const updated = [...current];
    updated[index] = { ...updated[index]!, ...patch, updatedAt: new Date().toISOString() };
    await this.kv.putSources(updated);
    return updated;
  }

  async remove(id: string): Promise<SourceRecord[] | null> {
    const current = await this.list();
    if (!current.some((s) => s.id === id)) return null;
    const updated = current.filter((s) => s.id !== id);
    await this.kv.putSources(updated);
    return updated;
  }
}
