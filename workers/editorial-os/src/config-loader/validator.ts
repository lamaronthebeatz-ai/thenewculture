/**
 * config-loader/validator.ts (PR #41) — schema validation only. Turns
 * a RawSourceEntry into a ValidatedSourceEntry, or a ConfigError.
 * Required: id, name, category, enabled, status. Optional (may be
 * absent or null): rss, youtube, homepage, notes. Never throws — an
 * invalid row becomes a ConfigError and is simply excluded from the
 * valid set, without affecting any other row ("No source may crash
 * Worker").
 */
import { SourceCategory } from "../collectors/base";
import { ConfigError } from "./errors";
import { RawSourceEntry, SourceStatus, ValidatedSourceEntry } from "./types";

const CATEGORIES: readonly SourceCategory[] = ["international", "vietnam", "youtube", "community"];
const STATUSES: readonly SourceStatus[] = ["supported", "not_supported", "unknown"];

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export type ValidateEntryResult =
  | { ok: true; entry: ValidatedSourceEntry }
  | { ok: false; error: ConfigError };

export function validateSourceEntry(raw: unknown): ValidateEntryResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: { sourceId: null, reason: "invalid_entry_shape", message: "Source entry is not a mapping/object." },
    };
  }

  const entry = raw as RawSourceEntry;
  const idForErrors = typeof entry.id === "string" ? entry.id : null;

  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    return {
      ok: false,
      error: { sourceId: idForErrors, reason: "missing_required_field", message: "Missing or invalid required field: id" },
    };
  }
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    return {
      ok: false,
      error: { sourceId: idForErrors, reason: "missing_required_field", message: `Missing or invalid required field: name (source ${entry.id})` },
    };
  }
  if (typeof entry.enabled !== "boolean") {
    return {
      ok: false,
      error: { sourceId: idForErrors, reason: "missing_required_field", message: `Missing or invalid required field: enabled (source ${entry.id})` },
    };
  }
  if (typeof entry.category !== "string") {
    return {
      ok: false,
      error: { sourceId: idForErrors, reason: "missing_required_field", message: `Missing or invalid required field: category (source ${entry.id})` },
    };
  }
  if (!CATEGORIES.includes(entry.category as SourceCategory)) {
    return {
      ok: false,
      error: {
        sourceId: idForErrors,
        reason: "invalid_field_value",
        message: `Invalid category "${entry.category}" (source ${entry.id}) — expected one of ${CATEGORIES.join(", ")}`,
      },
    };
  }
  if (typeof entry.status !== "string") {
    return {
      ok: false,
      error: { sourceId: idForErrors, reason: "missing_required_field", message: `Missing or invalid required field: status (source ${entry.id})` },
    };
  }
  if (!STATUSES.includes(entry.status as SourceStatus)) {
    return {
      ok: false,
      error: {
        sourceId: idForErrors,
        reason: "invalid_field_value",
        message: `Invalid status "${entry.status}" (source ${entry.id}) — expected one of ${STATUSES.join(", ")}`,
      },
    };
  }

  for (const [field, value] of [
    ["rss", entry.rss],
    ["youtube", entry.youtube],
    ["homepage", entry.homepage],
    ["notes", entry.notes],
  ] as const) {
    if (value !== undefined && !isNullableString(value)) {
      return {
        ok: false,
        error: {
          sourceId: idForErrors,
          reason: "invalid_field_value",
          message: `Optional field "${field}" must be a string or null (source ${entry.id})`,
        },
      };
    }
  }

  return {
    ok: true,
    entry: {
      id: entry.id,
      name: entry.name,
      category: entry.category as SourceCategory,
      enabled: entry.enabled,
      status: entry.status as SourceStatus,
      homepage: (entry.homepage as string | null | undefined) ?? null,
      rss: (entry.rss as string | null | undefined) ?? null,
      youtube: (entry.youtube as string | null | undefined) ?? null,
      notes: (entry.notes as string | null | undefined) ?? null,
    },
  };
}

export interface ValidateDocumentResult {
  validEntries: ValidatedSourceEntry[];
  errors: ConfigError[];
}

/** Validates every row, in order, and separately flags duplicate ids
 * (keeping the first occurrence, rejecting the rest as ConfigErrors) —
 * so one malformed or duplicated row never affects any other row. */
export function validateSourcesDocument(rawEntries: RawSourceEntry[]): ValidateDocumentResult {
  const validEntries: ValidatedSourceEntry[] = [];
  const errors: ConfigError[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawEntries) {
    const result = validateSourceEntry(raw);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    if (seenIds.has(result.entry.id)) {
      errors.push({
        sourceId: result.entry.id,
        reason: "duplicate_id",
        message: `Duplicate source id "${result.entry.id}" — keeping the first occurrence, ignoring this one.`,
      });
      continue;
    }
    seenIds.add(result.entry.id);
    validEntries.push(result.entry);
  }

  return { validEntries, errors };
}
