/**
 * Models — 1:1 port of editorial-intelligence/models/{enums,source,event,
 * mapping_result,story_candidate,dashboard_stats,recommendation}.py.
 *
 * Every enum value, field name and default is identical to the Python
 * source. The one unavoidable runtime difference: Python's
 * `generate_event_id()` uses `hashlib.sha256` synchronously; Cloudflare
 * Workers only expose SHA-256 through the async Web Crypto API
 * (`crypto.subtle.digest`), so `generateEventId`/`createEvent` are async
 * here where their Python originals are not. The algorithm (SHA-256 of
 * the same "artist|event_type|title|published_at" basis string, first 16
 * hex chars) is unchanged — only the calling convention is, because the
 * runtime has no synchronous hash primitive.
 */

// ---------------------------------------------------------------------
// enums.py
// ---------------------------------------------------------------------

export enum EventType {
  ALBUM_RELEASE = "album_release",
  SINGLE_RELEASE = "single_release",
  MV_RELEASE = "mv_release",
  ARTIST_ANNOUNCEMENT = "artist_announcement",
  FESTIVAL = "festival",
  CONCERT = "concert",
  INTERVIEW = "interview",
  AWARD = "award",
  COMMUNITY_EVENT = "community_event",
}

export enum EventStatus {
  DISCOVERED = "discovered",
  LOW_CONFIDENCE = "low_confidence",
  PENDING_REVIEW = "pending_review",
  MERGED = "merged",
  PROMPTED = "prompted",
  REJECTED = "rejected",
}

export enum SourceTier {
  TIER_1 = "tier_1",
  TIER_2 = "tier_2",
  TIER_3 = "tier_3",
  UNKNOWN = "unknown",
}

export const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  [SourceTier.TIER_1]: "Official",
  [SourceTier.TIER_2]: "Editorial",
  [SourceTier.TIER_3]: "Community",
  [SourceTier.UNKNOWN]: "Unknown",
};

export enum StoryType {
  BREAKING = "breaking",
  RELEASE = "release",
  FEATURE = "feature",
  INTERVIEW = "interview",
  REVIEW = "review",
  PROFILE = "profile",
  TIMELINE = "timeline",
  DISCOVERY = "discovery",
  COMMUNITY = "community",
  EDITORIAL = "editorial",
}

export enum EditorialDecisionType {
  PUBLISH = "publish",
  HOLD = "hold",
  REJECT = "reject",
  MERGE = "merge",
  NEED_MORE_SOURCES = "need_more_sources",
}

// ---------------------------------------------------------------------
// source.py
// ---------------------------------------------------------------------

export interface Source {
  readonly name: string;
  readonly tier: SourceTier;
  readonly url: string | null;
  readonly platform: string | null;
  readonly retrievedAt: string | null;
}

export function makeSource(input: {
  name: string;
  tier: SourceTier;
  url?: string | null;
  platform?: string | null;
  retrievedAt?: string | null;
}): Source {
  return {
    name: input.name,
    tier: input.tier,
    url: input.url ?? null,
    platform: input.platform ?? null,
    retrievedAt: input.retrievedAt ?? null,
  };
}

/** Stable identity for duplicate-source collapsing ("Duplicate Sources +5"
 * means the SAME named source counted twice, not two different sources). */
export function sourceKey(source: Source): string {
  return `${source.name}:${source.url ?? ""}`;
}

// ---------------------------------------------------------------------
// mapping_result.py
// ---------------------------------------------------------------------

export interface MappingResult {
  readonly category: string;
  readonly series: string | null;
  readonly profiles: string[];
  readonly tags: string[];
  readonly homepage: boolean;
  readonly magazine: boolean;
  readonly relatedProfiles: string[];
  readonly relatedSeries: string[];
  readonly searchWeight: number;
}

// ---------------------------------------------------------------------
// event.py
// ---------------------------------------------------------------------

export interface EditorialEvent {
  id: string;
  title: string;
  artist: string;
  eventType: EventType;
  description: string;
  publishedAt: string | null;

  sources: Source[];
  confidence: number;

  language: string;
  country: string;
  platform: string | null;
  image: string | null;

  status: EventStatus;

  relatedArtists: string[];
  relatedProfiles: string[];

  suggestedSeries: string | null;
  suggestedTags: string[];

  primarySource: Source | null;
  mappingResult: MappingResult | null;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic id from the facts that define "the same event",
 * independent of which Provider found it first — identical basis string
 * and truncation (first 16 hex chars) as Python's generate_event_id(). */
export async function generateEventId(
  artist: string,
  eventType: EventType,
  title: string,
  publishedAt: string | null | undefined,
): Promise<string> {
  const basis = [
    artist.trim().toLowerCase(),
    eventType,
    title.trim().toLowerCase(),
    (publishedAt ?? "").trim(),
  ].join("|");
  const hex = await sha256Hex(basis);
  return hex.slice(0, 16);
}

export interface CreateEventInput {
  title: string;
  artist: string;
  eventType: EventType;
  description: string;
  publishedAt?: string | null;
  language?: string;
  country?: string;
  platform?: string | null;
  image?: string | null;
  relatedArtists?: string[];
  relatedProfiles?: string[];
}

/** Preferred constructor — derives `id` instead of trusting a caller-
 * supplied one, exactly like EditorialEvent.create() in Python. */
export async function createEvent(input: CreateEventInput): Promise<EditorialEvent> {
  const publishedAt = input.publishedAt ?? null;
  const id = await generateEventId(input.artist, input.eventType, input.title, publishedAt);
  return {
    id,
    title: input.title,
    artist: input.artist,
    eventType: input.eventType,
    description: input.description,
    publishedAt,
    sources: [],
    confidence: 0,
    language: input.language ?? "vi",
    country: input.country ?? "VN",
    platform: input.platform ?? null,
    image: input.image ?? null,
    status: EventStatus.DISCOVERED,
    relatedArtists: input.relatedArtists ?? [],
    relatedProfiles: input.relatedProfiles ?? [],
    suggestedSeries: null,
    suggestedTags: [],
    primarySource: null,
    mappingResult: null,
  };
}

/** Append-only, deliberately NOT deduplicated (see events.ts's
 * ConfidenceEngine, "Duplicate Sources" signal) — same rule as Python's
 * EditorialEvent.add_source(). */
export function addSource(event: EditorialEvent, source: Source): void {
  event.sources.push(source);
}

export function uniqueSourceNames(event: EditorialEvent): string[] {
  const seen: string[] = [];
  for (const s of event.sources) {
    if (!seen.includes(s.name)) seen.push(s.name);
  }
  return seen;
}

// ---------------------------------------------------------------------
// story_candidate.py
// ---------------------------------------------------------------------

export interface EditorialAssignment {
  suggestedSeries: string | null;
  suggestedCategory: string | null;
  suggestedTags: string[];
  suggestedProfiles: string[];
  suggestedInternalLinks: string[];
  suggestedLength: string | null;
}

export function makeEmptyAssignment(): EditorialAssignment {
  return {
    suggestedSeries: null,
    suggestedCategory: null,
    suggestedTags: [],
    suggestedProfiles: [],
    suggestedInternalLinks: [],
    suggestedLength: null,
  };
}

export interface StoryCandidate {
  event: EditorialEvent;
  storyType: StoryType;
  priorityScore: number;
  decision: EditorialDecisionType | null;
  decisionReason: string;
  assignment: EditorialAssignment | null;
  editorialNotes: string[];
}

export function makeStoryCandidate(event: EditorialEvent, storyType: StoryType): StoryCandidate {
  return {
    event,
    storyType,
    priorityScore: 0,
    decision: null,
    decisionReason: "",
    assignment: null,
    editorialNotes: [],
  };
}

/** StoryCandidate.id property — always the wrapped event's id. */
export function storyId(story: StoryCandidate): string {
  return story.event.id;
}

// ---------------------------------------------------------------------
// dashboard_stats.py (Phase 3, section 8 — editorial/dashboard.py's output)
// ---------------------------------------------------------------------

export interface DashboardStats {
  readonly pending: number;
  readonly highPriority: number;
  readonly lowConfidence: number;
  readonly duplicate: number;
  readonly published: number;
  readonly rejected: number;
}

// ---------------------------------------------------------------------
// recommendation.py
// ---------------------------------------------------------------------

export interface Recommendations {
  readonly relatedProfiles: string[];
  readonly relatedArticles: string[];
  readonly relatedSeries: string[];
  readonly internalLinks: string[];
}
