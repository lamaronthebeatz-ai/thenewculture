import { describe, expect, it } from "vitest";
import { EventStatus, EventType } from "../../src/models";
import { FIXTURE_EVENTS, NewsProvider, ProviderRegistry } from "../../src/providers";

describe("NewsProvider", () => {
  it("sourceName matches the Python original", () => {
    expect(new NewsProvider().sourceName).toBe("News Fixtures");
  });

  it("fetch() returns the 3 bundled fixtures", () => {
    expect(new NewsProvider().fetch()).toHaveLength(3);
    expect(FIXTURE_EVENTS).toHaveLength(3);
  });

  it("normalize() applies EventNormalizer rules to every field", async () => {
    const provider = new NewsProvider();
    const [raw] = provider.fetch();
    const event = await provider.normalize(raw!);
    expect(event.title).toBe("Album Vọng Âm Ra Mắt"); // whitespace collapsed
    expect(event.eventType).toBe(EventType.ALBUM_RELEASE); // "Album Release" alias
    expect(event.publishedAt).toBe("2026-08-20"); // d/m/Y normalized
    expect(event.sources).toHaveLength(2);
  });

  it("collect() validates and drops invalid records", async () => {
    const provider = new NewsProvider([{ title: "", artist: "A", event_type: "album", sources: [] }]);
    const events = await provider.collect();
    expect(events).toHaveLength(0);
  });

  it("collect() end-to-end over all 3 fixtures produces 3 valid events", async () => {
    const events = await new NewsProvider().collect();
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.status).toBe(EventStatus.DISCOVERED);
    }
  });
});

describe("ProviderRegistry", () => {
  it("registers and lists providers", () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider());
    expect(registry.size).toBe(1);
    expect(registry.all()).toHaveLength(1);
  });

  it("throws when registering the same source name twice", () => {
    const registry = new ProviderRegistry();
    registry.register(new NewsProvider());
    expect(() => registry.register(new NewsProvider())).toThrow();
  });
});
