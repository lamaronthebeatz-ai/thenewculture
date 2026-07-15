import { describe, expect, it } from "vitest";
import { SourceRecord } from "../../../src/source-manager/types";
import {
  findDuplicateByUrl,
  findById,
  generateUniqueId,
  isValidFeedUrlFormat,
  isValidHttpUrl,
  isValidYoutubeUrlFormat,
} from "../../../src/source-manager/validation";

function record(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "existing-1",
    name: "Existing Source",
    type: "artist",
    category: "vietnam",
    homepage: null,
    rss: null,
    youtube: null,
    feedType: "manual",
    enabled: true,
    status: "unknown",
    verified: false,
    verifiedAt: null,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidHttpUrl", () => {
  it("accepts http/https URLs with a host", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://example.com/path")).toBe(true);
  });

  it("rejects malformed or non-http(s) input", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("isValidFeedUrlFormat / isValidYoutubeUrlFormat", () => {
  it("feed format accepts any well-formed http(s) URL", () => {
    expect(isValidFeedUrlFormat("https://example.com/feed.xml")).toBe(true);
    expect(isValidFeedUrlFormat("not a url")).toBe(false);
  });

  it("youtube format requires a youtube.com host", () => {
    expect(isValidYoutubeUrlFormat("https://www.youtube.com/channel/UCabc")).toBe(true);
    expect(isValidYoutubeUrlFormat("https://example.com/channel/UCabc")).toBe(false);
    expect(isValidYoutubeUrlFormat("not a url")).toBe(false);
  });
});

describe("findDuplicateByUrl", () => {
  it("finds a duplicate when a candidate URL matches an existing homepage/rss/youtube on any field", () => {
    const existing = [record({ id: "a", rss: "https://a.example.com/feed.xml" })];
    expect(findDuplicateByUrl(existing, ["https://a.example.com/feed.xml"])).toMatchObject({ id: "a" });
  });

  it("treats canonically-equivalent URLs (trailing slash, query string) as duplicates", () => {
    const existing = [record({ id: "a", homepage: "https://a.example.com/" })];
    expect(findDuplicateByUrl(existing, ["https://a.example.com?utm=1"])).toMatchObject({ id: "a" });
  });

  it("returns null when no URL matches", () => {
    const existing = [record({ id: "a", rss: "https://a.example.com/feed.xml" })];
    expect(findDuplicateByUrl(existing, ["https://b.example.com/feed.xml"])).toBeNull();
  });

  it("returns null when every candidate URL is null", () => {
    const existing = [record({ id: "a", rss: "https://a.example.com/feed.xml" })];
    expect(findDuplicateByUrl(existing, [null, null])).toBeNull();
  });
});

describe("findById", () => {
  it("finds an existing record by id", () => {
    const existing = [record({ id: "a" }), record({ id: "b" })];
    expect(findById(existing, "b")).toMatchObject({ id: "b" });
  });

  it("returns null for an unknown id", () => {
    expect(findById([record({ id: "a" })], "missing")).toBeNull();
  });
});

describe("generateUniqueId", () => {
  it("slugifies a name into kebab-case", () => {
    expect(generateUniqueId("HIEUTHUHAI", [])).toBe("hieuthuhai");
    expect(generateUniqueId("16 Typh", [])).toBe("16-typh");
  });

  it("strips diacritics", () => {
    expect(generateUniqueId("Vọng Âm", [])).toBe("vong-am");
  });

  it("disambiguates a collision with a numeric suffix", () => {
    const existing = [record({ id: "binz" })];
    expect(generateUniqueId("Binz", existing)).toBe("binz-2");
  });

  it("keeps disambiguating past multiple collisions", () => {
    const existing = [record({ id: "binz" }), record({ id: "binz-2" })];
    expect(generateUniqueId("Binz", existing)).toBe("binz-3");
  });
});
