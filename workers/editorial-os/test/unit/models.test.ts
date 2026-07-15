import { describe, expect, it } from "vitest";
import { createEvent, EventStatus, EventType, generateEventId, makeSource, SourceTier, sourceKey, addSource, uniqueSourceNames, storyId, makeStoryCandidate, StoryType } from "../../src/models";

describe("generateEventId", () => {
  it("is deterministic for the same facts", async () => {
    const id1 = await generateEventId("Nghệ Sĩ A", EventType.ALBUM_RELEASE, "Album X", "2026-08-20");
    const id2 = await generateEventId("Nghệ Sĩ A", EventType.ALBUM_RELEASE, "Album X", "2026-08-20");
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
  });

  it("is case/whitespace insensitive on artist and title, matching Python's .strip().lower()", async () => {
    const id1 = await generateEventId("Nghệ Sĩ A", EventType.ALBUM_RELEASE, "Album X", "2026-08-20");
    const id2 = await generateEventId("  nghệ sĩ a  ", EventType.ALBUM_RELEASE, "  album x  ", "2026-08-20");
    expect(id1).toBe(id2);
  });

  it("differs for a different event_type", async () => {
    const id1 = await generateEventId("A", EventType.ALBUM_RELEASE, "T", "2026-08-20");
    const id2 = await generateEventId("A", EventType.SINGLE_RELEASE, "T", "2026-08-20");
    expect(id1).not.toBe(id2);
  });
});

describe("createEvent", () => {
  it("defaults status to DISCOVERED and language/country to vi/VN", async () => {
    const event = await createEvent({
      title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d",
    });
    expect(event.status).toBe(EventStatus.DISCOVERED);
    expect(event.language).toBe("vi");
    expect(event.country).toBe("VN");
    expect(event.sources).toEqual([]);
    expect(event.confidence).toBe(0);
  });
});

describe("Source", () => {
  it("sourceKey combines name and url", () => {
    const s = makeSource({ name: "Official Website", tier: SourceTier.TIER_1, url: "https://x.com" });
    expect(sourceKey(s)).toBe("Official Website:https://x.com");
  });

  it("sourceKey handles a missing url", () => {
    const s = makeSource({ name: "YouTube Music", tier: SourceTier.TIER_3 });
    expect(sourceKey(s)).toBe("YouTube Music:");
  });
});

describe("addSource / uniqueSourceNames", () => {
  it("is append-only (not deduplicated)", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    addSource(event, makeSource({ name: "X", tier: SourceTier.TIER_1 }));
    addSource(event, makeSource({ name: "X", tier: SourceTier.TIER_1 }));
    expect(event.sources).toHaveLength(2);
    expect(uniqueSourceNames(event)).toEqual(["X"]);
  });
});

describe("storyId", () => {
  it("equals the wrapped event's id", async () => {
    const event = await createEvent({ title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d" });
    const story = makeStoryCandidate(event, StoryType.RELEASE);
    expect(storyId(story)).toBe(event.id);
  });
});
