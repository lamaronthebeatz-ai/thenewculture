/**
 * config-loader — shared types (PR #41, Registry Runtime Integration).
 *
 * This module connects the Editorial Configuration Layer
 * (/editorial-config/, PR #40) to the existing collector engine
 * (src/collectors/, PR #38-39) at runtime. It does not modify
 * CollectorPipeline, EditorialDesk, Workspace, Queue, Dashboard,
 * WorkerRunner, HealthEngine, API, or KV — it only produces the same
 * `SourceConfig[]` shape src/collectors/registry.ts's collectAllNews()
 * already consumes, sourced from editorial-config/sources.yaml instead
 * of the static src/collectors/sources.ts table.
 */
import { SourceCategory } from "../collectors/base";

/** The exact row shape of editorial-config/sources.yaml, before schema
 * validation — fields are typed loosely (`unknown`) here because
 * yaml.parse() returns untyed data; validator.ts narrows this into a
 * ValidatedSourceEntry. */
export interface RawSourceEntry {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  homepage?: unknown;
  rss?: unknown;
  youtube?: unknown;
  enabled?: unknown;
  status?: unknown;
  verified?: unknown;
  verifiedAt?: unknown;
  notes?: unknown;
}

export type SourceStatus = "supported" | "not_supported" | "unknown";

/** A source entry after passing schema validation — every required
 * field is present and correctly typed. */
export interface ValidatedSourceEntry {
  id: string;
  name: string;
  category: SourceCategory;
  enabled: boolean;
  status: SourceStatus;
  homepage: string | null;
  rss: string | null;
  youtube: string | null;
  notes: string | null;
}
