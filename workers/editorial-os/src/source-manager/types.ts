/**
 * Source Manager — shared types (Phase 10). This module lets editors
 * manage editorial sources entirely from the Dashboard: view/add/edit/
 * enable/disable/delete, with search/filter/sort. It is a pure
 * extension — CollectorPipeline, EditorialDesk, Workspace, Queue,
 * Dashboard metrics, WorkerRunner, HealthEngine, Cron, and the 5
 * existing API routes are all untouched.
 *
 * SourceRecord is the live, KV-persisted source model (the "Editorial
 * Configuration Layer" at runtime — see store.ts). It's a superset of
 * config-loader's ValidatedSourceEntry (id/name/category/enabled/
 * status/homepage/rss/youtube/notes): it adds `type` (the editorial
 * entity kind — SUPPORTED TYPES) and `feedType` (how it's technically
 * collected — SUPPORTED SOURCE TYPES), which the spec's ADD SOURCE
 * section requires auto-detecting and storing but which
 * editorial-config/sources.yaml's schema never had a field for.
 */
import { SourceCategory } from "../collectors/base";
import { SourceStatus } from "../config-loader/types";

/** "SUPPORTED TYPES" — the kind of editorial entity this source is. */
export type EntityType = "artist" | "label" | "crew" | "show" | "festival" | "studio" | "community" | "media" | "other";

export const ENTITY_TYPES: readonly EntityType[] = [
  "artist",
  "label",
  "crew",
  "show",
  "festival",
  "studio",
  "community",
  "media",
  "other",
];

/** "SUPPORTED SOURCE TYPES" — how this source is technically collected.
 * "Future types must be extensible": this is a plain string union, and
 * every place that switches on it (detection.ts, store.ts's adapter to
 * ValidatedSourceEntry) has an explicit default/manual fallback branch,
 * so adding a new value later never requires an exhaustiveness rewrite. */
export type FeedType = "website" | "rss" | "atom" | "youtube" | "manual";

export const FEED_TYPES: readonly FeedType[] = ["website", "rss", "atom", "youtube", "manual"];

export interface SourceRecord {
  id: string;
  name: string;
  type: EntityType;
  category: SourceCategory;
  homepage: string | null;
  rss: string | null;
  youtube: string | null;
  feedType: FeedType;
  enabled: boolean;
  status: SourceStatus;
  verified: boolean;
  verifiedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields an editor supplies when adding a source — everything else
 * (id, feedType, canonical URLs, timestamps) is derived. */
export interface NewSourceInput {
  name: string;
  type: EntityType;
  category: SourceCategory;
  pastedUrl: string;
  notes?: string;
}

/** Fields an editor may change on an existing source. */
export interface SourceUpdateInput {
  name?: string;
  type?: EntityType;
  category?: SourceCategory;
  homepage?: string | null;
  rss?: string | null;
  youtube?: string | null;
  enabled?: boolean;
  status?: SourceStatus;
  notes?: string;
}
