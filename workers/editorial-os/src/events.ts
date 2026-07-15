/**
 * Events — 1:1 port of editorial-intelligence/events/{normalizer,
 * validation,confidence,duplicate,mapping}.py. Every threshold, weight,
 * and rule below reads its value from config.ts (itself a verbatim port
 * of the YAML files) — nothing is hardcoded here that wasn't hardcoded
 * in the Python source either.
 */
import {
  confidenceWeights,
  editorialMapping,
  eventCategories,
  sourceTierLookup,
} from "./config";
import {
  addSource,
  EditorialEvent,
  EventStatus,
  EventType,
  MappingResult,
  Source,
  SourceTier,
  sourceKey,
} from "./models";

// =======================================================================
// normalizer.py
// =======================================================================

/** Collapse whitespace, strip control chars — does not touch diacritics. */
export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function dedupePreserveOrder(items: string[]): string[] {
  const seen: string[] = [];
  for (const item of items) {
    const cleaned = cleanText(item);
    if (cleaned && !seen.includes(cleaned)) seen.push(cleaned);
  }
  return seen;
}

const EVENT_TYPE_ALIASES: Record<string, EventType> = {
  album: EventType.ALBUM_RELEASE,
  album_release: EventType.ALBUM_RELEASE,
  single: EventType.SINGLE_RELEASE,
  single_release: EventType.SINGLE_RELEASE,
  mv: EventType.MV_RELEASE,
  music_video: EventType.MV_RELEASE,
  mv_release: EventType.MV_RELEASE,
  artist_announcement: EventType.ARTIST_ANNOUNCEMENT,
  announcement: EventType.ARTIST_ANNOUNCEMENT,
  festival: EventType.FESTIVAL,
  concert: EventType.CONCERT,
  show: EventType.CONCERT,
  live: EventType.CONCERT,
  interview: EventType.INTERVIEW,
  award: EventType.AWARD,
  awards: EventType.AWARD,
  community: EventType.COMMUNITY_EVENT,
  community_event: EventType.COMMUNITY_EVENT,
};

const SOURCE_TIER_ALIASES: Record<string, SourceTier> = {
  official: SourceTier.TIER_1,
  tier_1: SourceTier.TIER_1,
  tier1: SourceTier.TIER_1,
  editorial: SourceTier.TIER_2,
  tier_2: SourceTier.TIER_2,
  tier2: SourceTier.TIER_2,
  community: SourceTier.TIER_3,
  tier_3: SourceTier.TIER_3,
  tier3: SourceTier.TIER_3,
  unknown: SourceTier.UNKNOWN,
};

export function normalizeArtist(raw: string): string {
  return cleanText(raw);
}

export function normalizeTitle(raw: string): string {
  return cleanText(raw);
}

export function normalizePlatform(raw: string | null | undefined): string | null {
  const cleaned = cleanText(raw ?? "");
  return cleaned ? cleaned.toLowerCase() : null;
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  const cleaned = cleanText(raw ?? "");
  return cleaned || null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rule-based only — same fixed set of accepted input formats as Python's
 * normalize_date(), returning canonical ISO 'YYYY-MM-DD'. */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = cleanText(String(raw));
  if (!text) return null;

  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if ((m = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/))) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if ((m = text.match(/^(\d{2})-(\d{2})-(\d{4})$/))) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  if ((m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  if ((m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/))) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // Accepts a full ISO timestamp too, e.g. "2026-08-20T10:00:00Z"
  const isoPrefix = text.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    const d = new Date(`${isoPrefix}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }
  return null;
}

/** Raises for an unrecognized value — event_type is required/strongly
 * typed, same as Python's normalize_event_type(). */
export function normalizeEventType(raw: unknown): EventType {
  if (typeof raw === "string" && Object.values(EventType).includes(raw as EventType)) {
    return raw as EventType;
  }
  const key = cleanText(String(raw)).toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
  const found = EVENT_TYPE_ALIASES[key];
  if (found) return found;
  throw new Error(`event_type không hợp lệ: ${JSON.stringify(raw)}`);
}

/** Falls back to UNKNOWN instead of raising — same as Python's
 * normalize_source_tier(). */
export function normalizeSourceTier(raw: unknown): SourceTier {
  if (typeof raw === "string" && Object.values(SourceTier).includes(raw as SourceTier)) {
    return raw as SourceTier;
  }
  const key = cleanText(String(raw ?? "")).toLowerCase().replace(/-/g, "_").replace(/ /g, "_");
  return SOURCE_TIER_ALIASES[key] ?? SourceTier.UNKNOWN;
}

export const EventNormalizer = {
  artist: normalizeArtist,
  title: normalizeTitle,
  date: normalizeDate,
  url: normalizeUrl,
  platform: normalizePlatform,
  eventType: normalizeEventType,
  sourceTier: normalizeSourceTier,
};

// =======================================================================
// validation.py
// =======================================================================

export class ValidationError extends Error {}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.host);
  } catch {
    return false;
  }
}

/** Throws ValidationError on the first rule that fails, in the exact
 * order of validate_event() in Python. */
export function validateEvent(event: EditorialEvent, existingIds?: Iterable<string>): void {
  if (!event.title || !event.title.trim()) {
    throw new ValidationError("title bắt buộc");
  }
  if (!event.sources || event.sources.length === 0) {
    throw new ValidationError("source bắt buộc (event.sources rỗng)");
  }
  if (!event.publishedAt || !String(event.publishedAt).trim()) {
    throw new ValidationError("published_at bắt buộc");
  }
  if (!event.artist || !event.artist.trim()) {
    throw new ValidationError("artist ít nhất 1 (event.artist rỗng)");
  }
  if (!Object.values(EventType).includes(event.eventType)) {
    throw new ValidationError(`event_type không hợp lệ: ${JSON.stringify(event.eventType)}`);
  }
  for (const source of event.sources) {
    if (source.url && !isValidUrl(source.url)) {
      throw new ValidationError(`url không hợp lệ: ${JSON.stringify(source.url)}`);
    }
  }
  if (existingIds !== undefined && new Set(existingIds).has(event.id)) {
    throw new ValidationError(`duplicate id: ${event.id}`);
  }
}

// =======================================================================
// confidence.py
// =======================================================================

export interface ConfidenceWeightsShape {
  sourceWeights: Record<string, number>;
  defaultTierWeights: Record<string, number>;
  duplicateSourceBonus: number;
  promptEligibilityThreshold: number;
}

export class ConfidenceEngine {
  private weights: ConfidenceWeightsShape;
  private tierLookup: Record<string, string>;

  constructor(weights?: ConfidenceWeightsShape, tierLookup?: Record<string, string>) {
    this.weights = weights ?? confidenceWeights;
    this.tierLookup = tierLookup ?? sourceTierLookup;
  }

  /** Pure function of event.sources — does not mutate the event. */
  score(event: EditorialEvent): number {
    if (!event.sources || event.sources.length === 0) return 0;

    const occurrences = new Map<string, number>();
    for (const s of event.sources) {
      const key = sourceKey(s);
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }

    let total = 0;
    const seenNames = new Set<string>();
    for (const s of event.sources) {
      if (seenNames.has(s.name)) continue;
      seenNames.add(s.name);
      if (s.name in this.weights.sourceWeights) {
        total += this.weights.sourceWeights[s.name] ?? 0;
      } else {
        const tier = this.tierLookup[s.name] ?? s.tier;
        total += this.weights.defaultTierWeights[tier] ?? 0;
      }
    }

    let duplicateOccurrences = 0;
    for (const count of occurrences.values()) {
      if (count > 1) duplicateOccurrences += count - 1;
    }
    total += duplicateOccurrences * this.weights.duplicateSourceBonus;

    return total;
  }

  threshold(): number {
    return this.weights.promptEligibilityThreshold;
  }

  /** Scores the event and updates its confidence/status in place. */
  apply(event: EditorialEvent): EditorialEvent {
    event.confidence = this.score(event);
    if (event.confidence < this.threshold()) {
      event.status = EventStatus.LOW_CONFIDENCE;
    } else if (event.status === EventStatus.DISCOVERED) {
      event.status = EventStatus.PENDING_REVIEW;
    }
    return event;
  }

  isPromptEligible(event: EditorialEvent): boolean {
    return event.confidence >= this.threshold();
  }
}

// =======================================================================
// duplicate.py
// =======================================================================

const TITLE_SIMILARITY_THRESHOLD = 0.85;

const TIER_RANK: Record<SourceTier, number> = {
  [SourceTier.TIER_1]: 0,
  [SourceTier.TIER_2]: 1,
  [SourceTier.TIER_3]: 2,
  [SourceTier.UNKNOWN]: 3,
};

function normalizeForCompare(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/** Ratio-based string similarity matching Python's
 * difflib.SequenceMatcher(None, a, b).ratio() — 2*M / T, where M is the
 * total number of matched characters found by the same greedy
 * longest-matching-block algorithm, and T is len(a)+len(b). */
function sequenceMatcherRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const matches = countMatches(a, b);
  return (2.0 * matches) / (a.length + b.length);
}

function countMatches(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const { i, j, size } = longestMatch(a, 0, a.length, b, 0, b.length);
  if (size === 0) return 0;
  let total = size;
  total += countMatches(a.slice(0, i), b.slice(0, j));
  total += countMatches(a.slice(i + size), b.slice(j + size));
  return total;
}

function longestMatch(
  a: string,
  aLo: number,
  aHi: number,
  b: string,
  bLo: number,
  bHi: number,
): { i: number; j: number; size: number } {
  let bestI = aLo;
  let bestJ = bLo;
  let bestSize = 0;
  let j2len = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) {
    const newJ2Len = new Map<number, number>();
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newJ2Len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2Len;
  }
  return { i: bestI, j: bestJ, size: bestSize };
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return sequenceMatcherRatio(na, nb) >= TITLE_SIMILARITY_THRESHOLD;
}

function eventUrls(event: EditorialEvent): Set<string> {
  const urls = new Set<string>();
  for (const s of event.sources) {
    if (s.url) urls.add(normalizeForCompare(s.url));
  }
  return urls;
}

function urlsMatch(a: EditorialEvent, b: EditorialEvent): boolean {
  const urlsA = eventUrls(a);
  const urlsB = eventUrls(b);
  if (urlsA.size === 0 || urlsB.size === 0) return false;
  for (const u of urlsA) {
    if (urlsB.has(u)) return true;
  }
  return false;
}

function selectPrimarySource(sources: Source[]): Source | null {
  if (sources.length === 0) return null;
  let best = sources[0]!;
  let bestRank = TIER_RANK[best.tier] ?? 99;
  for (const s of sources.slice(1)) {
    const rank = TIER_RANK[s.tier] ?? 99;
    if (rank < bestRank) {
      best = s;
      bestRank = rank;
    }
  }
  return best;
}

export class DuplicateEngine {
  isDuplicate(a: EditorialEvent, b: EditorialEvent): boolean {
    if (normalizeForCompare(a.artist) !== normalizeForCompare(b.artist)) return false;
    if (a.eventType !== b.eventType) return false;

    let secondaryMatches = 0;
    if (a.publishedAt && b.publishedAt && normalizeForCompare(a.publishedAt) === normalizeForCompare(b.publishedAt)) {
      secondaryMatches += 1;
    }
    if (titlesMatch(a.title, b.title)) secondaryMatches += 1;
    if (a.platform && b.platform && normalizeForCompare(a.platform) === normalizeForCompare(b.platform)) {
      secondaryMatches += 1;
    }
    if (urlsMatch(a, b)) secondaryMatches += 1;

    return secondaryMatches >= 2;
  }

  findDuplicate(event: EditorialEvent, existing: EditorialEvent[]): EditorialEvent | null {
    for (const candidate of existing) {
      if (candidate.status === EventStatus.MERGED) continue;
      if (this.isDuplicate(event, candidate)) return candidate;
    }
    return null;
  }

  /** Folds `duplicate` into `primary` in place. */
  merge(primary: EditorialEvent, duplicate: EditorialEvent): EditorialEvent {
    for (const source of duplicate.sources) {
      addSource(primary, source);
    }
    for (const artist of duplicate.relatedArtists) {
      if (!primary.relatedArtists.includes(artist)) primary.relatedArtists.push(artist);
    }
    for (const profile of duplicate.relatedProfiles) {
      if (!primary.relatedProfiles.includes(profile)) primary.relatedProfiles.push(profile);
    }
    for (const tag of duplicate.suggestedTags) {
      if (!primary.suggestedTags.includes(tag)) primary.suggestedTags.push(tag);
    }
    duplicate.status = EventStatus.MERGED;
    primary.primarySource = selectPrimarySource(primary.sources);
    return primary;
  }

  /** Returns [eventToKeep, wasMerged]. */
  process(event: EditorialEvent, existing: EditorialEvent[]): [EditorialEvent, boolean] {
    const duplicateOf = this.findDuplicate(event, existing);
    if (duplicateOf === null) {
      event.primarySource = selectPrimarySource(event.sources);
      return [event, false];
    }
    return [this.merge(duplicateOf, event), true];
  }
}

// =======================================================================
// mapping.py
// =======================================================================

const TAG_UNSAFE = /[^a-zA-Z0-9]+/g;

function stripDiacritics(text: string): string {
  // Same NFD-decompose-then-strip technique as Python's
  // unicodedata.normalize("NFD", text).encode("ascii", "ignore") —
  // decomposed Vietnamese base letters are already plain ASCII; only the
  // following combining marks (U+0300-U+036F) need removing.
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toTag(text: string): string {
  const ascii = stripDiacritics(text);
  return "#" + ascii.replace(TAG_UNSAFE, "");
}

function slugifyProfile(text: string): string {
  const ascii = stripDiacritics(text);
  return ascii.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function dedupeList(items: string[]): string[] {
  const seen: string[] = [];
  for (const item of items) {
    if (item && !seen.includes(item)) seen.push(item);
  }
  return seen;
}

function titleCaseWords(text: string): string {
  return text
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export interface EditorialMappingEngineOptions {
  mapping?: Record<string, string>;
  categories?: typeof eventCategories;
}

export class EditorialMappingEngine {
  private mapping: Record<string, string>;
  private categories: typeof eventCategories;

  constructor(options: EditorialMappingEngineOptions = {}) {
    this.mapping = options.mapping ?? editorialMapping;
    this.categories = options.categories ?? eventCategories;
  }

  suggestSeries(event: EditorialEvent): string | null {
    return this.mapping[event.eventType] ?? null;
  }

  suggestTags(event: EditorialEvent): string[] {
    const tags = ["#TNC"];
    if (event.artist) tags.push(toTag(event.artist));
    const series = this.suggestSeries(event);
    if (series) {
      // "tnc-records" -> "TNC Records" -> "#TNCRecords"
      tags.push(toTag(titleCaseWords(series.replace(/-/g, " "))));
    }
    const seen: string[] = [];
    for (const t of tags) {
      if (t !== "#" && !seen.includes(t)) seen.push(t);
    }
    return seen;
  }

  apply(event: EditorialEvent): EditorialEvent {
    event.suggestedSeries = this.suggestSeries(event);
    event.suggestedTags = this.suggestTags(event);
    return event;
  }

  applyFull(event: EditorialEvent): MappingResult {
    this.apply(event);
    const eventType = event.eventType;

    const category = this.categories.categories[eventType] ?? "Uncategorized";
    const relatedSeries = [...(this.categories.relatedSeries[eventType] ?? [])];

    const homepage =
      this.categories.homepageEligibleEventTypes.includes(eventType) &&
      event.confidence >= this.categories.homepageConfidenceThreshold;
    const magazine =
      this.categories.magazineEligibleEventTypes.includes(eventType) &&
      event.confidence >= this.categories.magazineConfidenceThreshold;

    const base = this.categories.searchWeightBase;
    const multiplier = this.categories.searchWeightConfidenceMultiplier;
    const searchWeight = Math.trunc(base + event.confidence * multiplier);

    const profiles = dedupeList(
      (event.artist ? [slugifyProfile(event.artist)] : []).concat(event.relatedProfiles),
    );

    const result: MappingResult = {
      category,
      series: event.suggestedSeries,
      profiles,
      tags: [...event.suggestedTags],
      homepage,
      magazine,
      relatedProfiles: [...event.relatedProfiles],
      relatedSeries,
      searchWeight,
    };
    event.mappingResult = result;
    return result;
  }
}
