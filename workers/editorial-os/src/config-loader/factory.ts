/**
 * config-loader/factory.ts (PR #41) — the only file that knows about
 * src/collectors/base.ts's SourceConfig shape. Converts validated
 * editorial-config rows into the exact SourceConfig[] the existing,
 * unmodified collector engine (src/collectors/registry.ts's
 * collectAllNews()) already consumes — no changes to that engine were
 * needed, since it never cared where its SourceConfig[] came from.
 *
 * RULES (verbatim from the spec):
 *   "enabled == false -> Ignore"      — the whole entry produces zero
 *                                        SourceConfig rows.
 *   "rss == null -> Ignore RSS Collector"       — no rss-type row.
 *   "youtube == null -> Ignore YouTube Collector" — no youtube-type row.
 * So one editorial-config entry produces 0, 1, or 2 SourceConfig rows
 * — one per non-null feed field, only when enabled.
 */
import { SourceTier } from "../models";
import { CollectorHealthEntry } from "../collectors/health";
import { SourceCategory, SourceConfig } from "../collectors/base";
import { ConfigError } from "./errors";
import { parseSourcesYaml } from "./loader";
import { validateSourcesDocument } from "./validator";
import { ValidatedSourceEntry } from "./types";

/** Editorial-config's sources.yaml (PR #40) has no per-source `tier`
 * field — only `category`. This is the registry-level default tier a
 * source gets purely from its category, matching the same convention
 * already used when src/collectors/sources.ts was first populated
 * (PR #39): official artist/show YouTube channels are tier_1, major
 * outlets and labels are tier_2 (except an artist's own label, still
 * tier_1), community/fan sources are tier_3. */
export function defaultTierForCategory(category: SourceCategory): SourceTier {
  switch (category) {
    case "youtube":
      return SourceTier.TIER_1;
    case "community":
      return SourceTier.TIER_3;
    case "international":
    case "vietnam":
    default:
      return SourceTier.TIER_2;
  }
}

/** Fixed defaults for fields editorial-config/sources.yaml does not
 * carry per-row. Wiring these from editorial-config/source-rules.yaml
 * instead is deferred to a later integration PR — this PR's scope is
 * sources.yaml only, per the spec's own FLOW section. */
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY = 1;

export function validatedEntryToSourceConfigs(entry: ValidatedSourceEntry): SourceConfig[] {
  if (!entry.enabled) return [];

  const base = {
    category: entry.category,
    tier: defaultTierForCategory(entry.category),
    enabled: entry.enabled,
    notes: entry.notes ?? "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retry: DEFAULT_RETRY,
    ...(entry.category === "youtube" ? { defaultArtist: entry.name } : {}),
  };

  const configs: SourceConfig[] = [];
  if (entry.rss !== null) {
    configs.push({ id: `${entry.id}-rss`, name: entry.name, type: "rss", url: entry.rss, ...base });
  }
  if (entry.youtube !== null) {
    configs.push({ id: `${entry.id}-youtube`, name: entry.name, type: "youtube", url: entry.youtube, ...base });
  }
  return configs;
}

/** Turns a ConfigError into a Collector-Health-visible entry (spec:
 * "If invalid -> Collector Health -> CONFIG_ERROR. Worker continues
 * running."). Distinct from every existing CollectorHealthStatus value
 * — this row never became a real collector, so it was never fetched:
 * neither lastSuccess nor lastFailure is set, same treatment as
 * "disabled"/"not_configured". */
export function configErrorToHealthEntry(error: ConfigError): CollectorHealthEntry {
  return {
    sourceId: error.sourceId ?? "<unknown>",
    sourceName: error.sourceId ?? "(unidentified source)",
    status: "config_error",
    lastSuccess: null,
    lastFailure: null,
    responseTimeMs: null,
    itemsCollected: 0,
    retryCount: 0,
  };
}

export interface LoadSourceConfigResult {
  sources: SourceConfig[];
  configErrors: ConfigError[];
  configErrorHealth: CollectorHealthEntry[];
}

/** The one function service.ts calls: given the raw text of
 * editorial-config/sources.yaml, returns the SourceConfig[] the
 * existing collector engine should run this cycle, plus every
 * validation problem found (as data, never a throw) so it can be
 * surfaced on Collector Health without ever stopping the Worker. */
export function loadSourceConfigFromYaml(rawYamlText: string): LoadSourceConfigResult {
  const { rawEntries, documentError } = parseSourcesYaml(rawYamlText);
  if (documentError) {
    return { sources: [], configErrors: [documentError], configErrorHealth: [configErrorToHealthEntry(documentError)] };
  }

  const { validEntries, errors } = validateSourcesDocument(rawEntries);
  const sources = validEntries.flatMap(validatedEntryToSourceConfigs);

  return {
    sources,
    configErrors: errors,
    configErrorHealth: errors.map(configErrorToHealthEntry),
  };
}
