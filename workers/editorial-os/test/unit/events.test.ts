import { describe, expect, it } from "vitest";
import {
  cleanText,
  ConfidenceEngine,
  dedupePreserveOrder,
  DuplicateEngine,
  EditorialMappingEngine,
  normalizeDate,
  normalizeEventType,
  normalizeSourceTier,
  ValidationError,
  validateEvent,
} from "../../src/events";
import { addSource, createEvent, EditorialEvent, EventStatus, EventType, makeSource, SourceTier } from "../../src/models";

describe("cleanText / dedupePreserveOrder", () => {
  it("collapses whitespace and trims, keeps diacritics", () => {
    expect(cleanText("  Album   Vọng  Âm  Ra Mắt  ")).toBe("Album Vọng Âm Ra Mắt");
  });

  it("dedupes preserving first-seen order", () => {
    expect(dedupePreserveOrder(["A", "  a  ".trim() === "a" ? "A" : "x", "A", "B"])).toEqual(["A", "B"]);
  });
});

describe("normalizeDate", () => {
  it("accepts d/m/Y", () => expect(normalizeDate("20/08/2026")).toBe("2026-08-20"));
  it("accepts Y-m-d", () => expect(normalizeDate("2026-08-05")).toBe("2026-08-05"));
  it("accepts d.m.Y", () => expect(normalizeDate("20.09.2026")).toBe("2026-09-20"));
  it("accepts a full ISO timestamp prefix", () => expect(normalizeDate("2026-08-20T10:00:00Z")).toBe("2026-08-20"));
  it("returns null for garbage", () => expect(normalizeDate("not-a-date")).toBeNull());
  it("returns null for empty/undefined", () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});

describe("normalizeEventType", () => {
  it("accepts aliases case/dash/space-insensitively", () => {
    expect(normalizeEventType("Album Release")).toBe(EventType.ALBUM_RELEASE);
    expect(normalizeEventType("single")).toBe(EventType.SINGLE_RELEASE);
    expect(normalizeEventType("FESTIVAL")).toBe(EventType.FESTIVAL);
  });
  it("throws for an unrecognized value", () => {
    expect(() => normalizeEventType("not-a-type")).toThrow();
  });
});

describe("normalizeSourceTier", () => {
  it("maps aliases to the right tier", () => {
    expect(normalizeSourceTier("official")).toBe(SourceTier.TIER_1);
    expect(normalizeSourceTier("editorial")).toBe(SourceTier.TIER_2);
    expect(normalizeSourceTier("community")).toBe(SourceTier.TIER_3);
  });
  it("falls back to UNKNOWN instead of throwing", () => {
    expect(normalizeSourceTier("something-else")).toBe(SourceTier.UNKNOWN);
  });
});

async function validEvent(overrides: Partial<Awaited<ReturnType<typeof createEvent>>> = {}): Promise<EditorialEvent> {
  const event = await createEvent({
    title: "Title", artist: "Artist", eventType: EventType.ALBUM_RELEASE,
    description: "d", publishedAt: "2026-08-20",
  });
  addSource(event, makeSource({ name: "Official Website", tier: SourceTier.TIER_1, url: "https://example.com" }));
  Object.assign(event, overrides);
  return event;
}

describe("validateEvent", () => {
  it("passes a fully-formed event", async () => {
    const event = await validEvent();
    expect(() => validateEvent(event)).not.toThrow();
  });

  it("requires a title", async () => {
    const event = await validEvent({ title: "  " });
    expect(() => validateEvent(event)).toThrow(ValidationError);
  });

  it("requires at least 1 source", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    expect(() => validateEvent(event)).toThrow(ValidationError);
  });

  it("requires published_at", async () => {
    const event = await validEvent({ publishedAt: null });
    expect(() => validateEvent(event)).toThrow(ValidationError);
  });

  it("requires artist", async () => {
    const event = await validEvent({ artist: "" });
    expect(() => validateEvent(event)).toThrow(ValidationError);
  });

  it("rejects an invalid source url", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    addSource(event, makeSource({ name: "X", tier: SourceTier.TIER_1, url: "not-a-url" }));
    expect(() => validateEvent(event)).toThrow(ValidationError);
  });

  it("rejects a duplicate id within the given existingIds set", async () => {
    const event = await validEvent();
    expect(() => validateEvent(event, new Set([event.id]))).toThrow(ValidationError);
  });
});

describe("ConfidenceEngine", () => {
  it("scores 0 for an event with no sources", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    expect(new ConfidenceEngine().score(event)).toBe(0);
  });

  it("matches the exact fixture confidence values (70 / 4 / 7)", async () => {
    const engine = new ConfidenceEngine();

    const e1 = await createEvent({ title: "T1", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    addSource(e1, makeSource({ name: "Official Website", tier: SourceTier.TIER_1 }));
    addSource(e1, makeSource({ name: "Spotify Artist", tier: SourceTier.TIER_1 }));
    expect(engine.score(e1)).toBe(70);

    const e2 = await createEvent({ title: "T2", artist: "B", eventType: EventType.SINGLE_RELEASE, description: "d" });
    addSource(e2, makeSource({ name: "YouTube Music", tier: SourceTier.TIER_3 }));
    expect(engine.score(e2)).toBe(4);

    const e3 = await createEvent({ title: "T3", artist: "C", eventType: EventType.FESTIVAL, description: "d" });
    addSource(e3, makeSource({ name: "Festival Organizers", tier: SourceTier.TIER_2 }));
    expect(engine.score(e3)).toBe(7);
  });

  it("adds duplicate_source_bonus for repeat occurrences of the same source", async () => {
    const engine = new ConfidenceEngine();
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    addSource(event, makeSource({ name: "Official Website", tier: SourceTier.TIER_1, url: "https://x.com" }));
    addSource(event, makeSource({ name: "Official Website", tier: SourceTier.TIER_1, url: "https://x.com" }));
    // 50 (unique name weight) + 1 duplicate occurrence * 5 bonus = 55
    expect(engine.score(event)).toBe(55);
  });

  it("apply() sets LOW_CONFIDENCE below threshold, PENDING_REVIEW at/above it", async () => {
    const engine = new ConfidenceEngine();
    const low = await createEvent({ title: "T", artist: "A", eventType: EventType.SINGLE_RELEASE, description: "d" });
    addSource(low, makeSource({ name: "YouTube Music", tier: SourceTier.TIER_3 }));
    engine.apply(low);
    expect(low.status).toBe(EventStatus.LOW_CONFIDENCE);
    expect(engine.isPromptEligible(low)).toBe(false);

    const high = await createEvent({ title: "T2", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    addSource(high, makeSource({ name: "Official Website", tier: SourceTier.TIER_1 }));
    engine.apply(high);
    expect(high.status).toBe(EventStatus.PENDING_REVIEW);
    expect(engine.isPromptEligible(high)).toBe(true);
  });
});

describe("DuplicateEngine", () => {
  it("does not merge different artists", async () => {
    const a = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    const b = await createEvent({ title: "T", artist: "B", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    expect(new DuplicateEngine().isDuplicate(a, b)).toBe(false);
  });

  it("merges when artist+type match and >=2 secondary signals agree", async () => {
    const a = await createEvent({ title: "Album X", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20", platform: "spotify" });
    const b = await createEvent({ title: "Album X", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20", platform: "apple" });
    expect(new DuplicateEngine().isDuplicate(a, b)).toBe(true); // date + title match = 2
  });

  it("does not merge on only 1 secondary signal", async () => {
    const a = await createEvent({ title: "Album X", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    const b = await createEvent({ title: "Completely Different Title Here", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: null });
    expect(new DuplicateEngine().isDuplicate(a, b)).toBe(false);
  });

  it("merge() combines sources and marks the duplicate MERGED", async () => {
    const primary = await createEvent({ title: "Album X", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    addSource(primary, makeSource({ name: "Official Website", tier: SourceTier.TIER_1 }));
    const dup = await createEvent({ title: "Album X", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20" });
    addSource(dup, makeSource({ name: "Spotify Artist", tier: SourceTier.TIER_1 }));

    const engine = new DuplicateEngine();
    const merged = engine.merge(primary, dup);
    expect(merged.sources).toHaveLength(2);
    expect(dup.status).toBe(EventStatus.MERGED);
    expect(merged.primarySource?.name).toBe("Official Website"); // tier_1 rank wins over tier_1 too (first seen)
  });

  it("process() returns [event, false] when no duplicate exists", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    addSource(event, makeSource({ name: "Official Website", tier: SourceTier.TIER_1 }));
    const [kept, wasMerged] = new DuplicateEngine().process(event, []);
    expect(wasMerged).toBe(false);
    expect(kept).toBe(event);
    expect(kept.primarySource).not.toBeNull();
  });
});

describe("EditorialMappingEngine", () => {
  it("suggestSeries maps album_release -> tnc-records", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    expect(new EditorialMappingEngine().suggestSeries(event)).toBe("tnc-records");
  });

  it("suggestTags produces #TNC, artist tag, series tag with diacritics stripped", async () => {
    const event = await createEvent({ title: "T", artist: "Nghệ Sĩ A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    const tags = new EditorialMappingEngine().suggestTags(event);
    expect(tags).toEqual(["#TNC", "#NgheSiA", "#TncRecords"]);
  });

  it("apply() sets suggestedSeries/suggestedTags on the event", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    new EditorialMappingEngine().apply(event);
    expect(event.suggestedSeries).toBe("tnc-records");
    expect(event.suggestedTags.length).toBeGreaterThan(0);
  });

  it("applyFull() computes homepage/magazine eligibility from confidence threshold", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    event.confidence = 70;
    const result = new EditorialMappingEngine().applyFull(event);
    expect(result.homepage).toBe(true); // album_release eligible, confidence>=70
    expect(result.magazine).toBe(true); // album_release eligible, confidence>=50
    expect(result.category).toBe("Release");
  });

  it("applyFull() search_weight = base + confidence*multiplier (int)", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    event.confidence = 70;
    const result = new EditorialMappingEngine().applyFull(event);
    expect(result.searchWeight).toBe(10 + Math.trunc(70 * 0.5));
  });

  it("applyFull() slugifies the artist into profiles, deduped with related_profiles", async () => {
    const event = await createEvent({ title: "T", artist: "Nghệ Sĩ A", eventType: EventType.ALBUM_RELEASE, description: "d", relatedProfiles: ["nghe-si-a"] });
    const result = new EditorialMappingEngine().applyFull(event);
    expect(result.profiles).toEqual(["nghe-si-a"]);
  });
});
