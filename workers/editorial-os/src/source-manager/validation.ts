/**
 * Source Manager — validation (Phase 10). Format checks + duplicate
 * detection for Add/Edit Source. Every check here is data-driven
 * (returns a result, never throws), matching the whole project's
 * "no source may crash Worker" discipline.
 */
import { canonicalizeUrl } from "../collectors/base";
import { SourceRecord } from "./types";

export type ValidationErrorReason =
  | "missing_name"
  | "missing_url"
  | "invalid_url"
  | "invalid_feed_url"
  | "invalid_youtube_url"
  | "duplicate_id"
  | "duplicate_url"
  | "not_found";

export interface ValidationError {
  reason: ValidationErrorReason;
  message: string;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isValidFeedUrlFormat(value: string): boolean {
  return isValidHttpUrl(value);
}

export function isValidYoutubeUrlFormat(value: string): boolean {
  if (!isValidHttpUrl(value)) return false;
  try {
    const host = new URL(value).hostname;
    return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com";
  } catch {
    return false;
  }
}

/** Prevents duplicate sources by comparing canonicalized homepage/rss/
 * youtube URLs against every existing record — a source is a
 * duplicate if it shares a canonical URL with an existing one on *any*
 * of those three fields, regardless of which field it's stored under. */
export function findDuplicateByUrl(existing: SourceRecord[], candidateUrls: Array<string | null>): SourceRecord | null {
  const candidateCanonical = candidateUrls.filter((u): u is string => u !== null).map(canonicalizeUrl);
  if (candidateCanonical.length === 0) return null;

  for (const record of existing) {
    const recordCanonical = [record.homepage, record.rss, record.youtube].filter((u): u is string => u !== null).map(canonicalizeUrl);
    if (recordCanonical.some((c) => candidateCanonical.includes(c))) return record;
  }
  return null;
}

export function findById(existing: SourceRecord[], id: string): SourceRecord | null {
  return existing.find((s) => s.id === id) ?? null;
}

/** Slugifies a name into a stable, unique kebab-case id, disambiguating
 * with a numeric suffix on collision (same convention already used for
 * every hand-authored id in editorial-config/sources.yaml). */
export function generateUniqueId(name: string, existing: SourceRecord[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "source";
  const existingIds = new Set(existing.map((s) => s.id));
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
