/**
 * Providers — 1:1 port of editorial-intelligence/providers/{base,
 * news_provider,registry}.py.
 *
 * One necessary adaptation: Python's NewsProvider reads `*.json` files
 * from a fixtures directory on disk (`fetch()` is the one place I/O is
 * allowed). Cloudflare Workers have no filesystem, so `fetch()` here
 * returns a bundled, in-memory fixture array instead — same 3 records,
 * byte-identical to editorial-intelligence/tests/fixtures/news/
 * event_0{1,2,3}.json, in the same file-name order. Everything else
 * (normalize/validate, and the collect() template method) is unchanged.
 */
import { cleanText, dedupePreserveOrder, EventNormalizer, validateEvent, ValidationError } from "./events";
import { addSource, createEvent, EditorialEvent, makeSource } from "./models";

export type RawPayload = Record<string, unknown>;

export interface EventProvider {
  readonly sourceName: string;
  fetch(): Promise<RawPayload[]> | RawPayload[];
  normalize(raw: RawPayload): Promise<EditorialEvent> | EditorialEvent;
  validate(event: EditorialEvent): boolean;
  collect(): Promise<EditorialEvent[]>;
}

/** Template method tying fetch/normalize/validate together — every
 * concrete provider gets this via `collectWith()` instead of
 * reimplementing the loop, matching Python's EventProvider.collect(). */
export async function collectWith(provider: EventProvider): Promise<EditorialEvent[]> {
  const events: EditorialEvent[] = [];
  const raws = await provider.fetch();
  for (const raw of raws) {
    const event = await provider.normalize(raw);
    if (provider.validate(event)) events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------
// Bundled fixtures — verbatim port of tests/fixtures/news/event_0{1,2,3}.json
// ---------------------------------------------------------------------

export const FIXTURE_EVENTS: RawPayload[] = [
  {
    title: "  Album   Vọng  Âm  Ra Mắt  ",
    artist: "Nghệ Sĩ A",
    event_type: "Album Release",
    description: "Album phòng thu thứ ba của Nghệ Sĩ A, phát hành trên mọi nền tảng.",
    published_at: "20/08/2026",
    platform: "Spotify",
    image: "/uploads/vong-am-cover.jpg",
    related_artists: ["Nghệ Sĩ D"],
    related_profiles: [],
    sources: [
      {
        name: "Official Website",
        tier: "official",
        url: "https://nghesia.example.com/vong-am",
        retrieved_at: "2026-08-20T09:00:00Z",
      },
      {
        name: "Spotify Artist",
        tier: "official",
        url: "https://open.spotify.com/artist/nghesia",
        retrieved_at: "2026-08-20T09:05:00Z",
      },
    ],
  },
  {
    title: "Bài Hát Mới Của Nghệ Sĩ B",
    artist: "Nghệ Sĩ B",
    event_type: "single",
    description: "Một fan page chia sẻ lại thông tin phát hành, chưa có xác nhận chính thức.",
    published_at: "2026-08-05",
    platform: "YouTube Music",
    image: null,
    related_artists: [],
    related_profiles: [],
    sources: [
      { name: "YouTube Music", tier: "community", url: null, retrieved_at: "2026-08-05T12:00:00Z" },
    ],
  },
  {
    title: "Lễ Hội Âm Nhạc Underground 2026 Công Bố Line-up",
    artist: "Various Artists",
    event_type: "FESTIVAL",
    description: "Ban tổ chức công bố danh sách nghệ sĩ tham gia lễ hội cuối năm.",
    published_at: "20.09.2026",
    platform: "Facebook",
    image: "/uploads/festival-2026-poster.jpg",
    related_artists: ["Nghệ Sĩ A", "Nghệ Sĩ C"],
    related_profiles: ["nghe-si-a"],
    sources: [
      {
        name: "Festival Organizers",
        tier: "editorial",
        url: "https://festival2026.example.com/lineup",
        retrieved_at: "2026-09-01T08:00:00Z",
      },
    ],
  },
];

// ---------------------------------------------------------------------
// NewsProvider
// ---------------------------------------------------------------------

export class NewsProvider implements EventProvider {
  private seenIds: Set<string> = new Set();
  private fixtures: RawPayload[];

  constructor(fixtures: RawPayload[] = FIXTURE_EVENTS) {
    this.fixtures = fixtures;
  }

  get sourceName(): string {
    return "News Fixtures";
  }

  fetch(): RawPayload[] {
    this.seenIds = new Set(); // fresh dedupe-within-this-batch tracking each fetch
    return [...this.fixtures];
  }

  async normalize(raw: RawPayload): Promise<EditorialEvent> {
    const eventType = EventNormalizer.eventType(raw["event_type"]);
    const title = EventNormalizer.title(String(raw["title"]));
    const artist = EventNormalizer.artist(String(raw["artist"]));
    const publishedAt = EventNormalizer.date(raw["published_at"] as string | null | undefined);
    const platform = EventNormalizer.platform(raw["platform"] as string | null | undefined);

    const event = await createEvent({
      title,
      artist,
      eventType,
      description: cleanText((raw["description"] as string) ?? ""),
      publishedAt,
      platform,
      image: (raw["image"] as string | null) ?? null,
      relatedArtists: dedupePreserveOrder((raw["related_artists"] as string[]) ?? []),
      relatedProfiles: dedupePreserveOrder((raw["related_profiles"] as string[]) ?? []),
    });

    for (const rawSource of (raw["sources"] as Record<string, unknown>[]) ?? []) {
      addSource(
        event,
        makeSource({
          name: String(rawSource["name"]),
          tier: EventNormalizer.sourceTier(rawSource["tier"]),
          url: EventNormalizer.url(rawSource["url"] as string | null | undefined),
          platform: EventNormalizer.platform(rawSource["platform"] as string | null | undefined) ?? platform,
          retrievedAt: (rawSource["retrieved_at"] as string | null) ?? null,
        }),
      );
    }
    return event;
  }

  validate(event: EditorialEvent): boolean {
    try {
      validateEvent(event, this.seenIds);
    } catch (err) {
      if (err instanceof ValidationError) return false;
      throw err;
    }
    this.seenIds.add(event.id);
    return true;
  }

  async collect(): Promise<EditorialEvent[]> {
    return collectWith(this);
  }
}

// ---------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------

export class ProviderRegistry {
  private providers = new Map<string, EventProvider>();

  register(provider: EventProvider): void {
    if (this.providers.has(provider.sourceName)) {
      throw new Error(`Provider already registered for source '${provider.sourceName}'`);
    }
    this.providers.set(provider.sourceName, provider);
  }

  unregister(sourceName: string): void {
    this.providers.delete(sourceName);
  }

  get(sourceName: string): EventProvider | undefined {
    return this.providers.get(sourceName);
  }

  all(): EventProvider[] {
    return [...this.providers.values()];
  }

  get size(): number {
    return this.providers.size;
  }
}
