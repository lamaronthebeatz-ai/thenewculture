import { describe, expect, it } from "vitest";
import { validateSourceEntry, validateSourcesDocument } from "../../../src/config-loader/validator";

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "a",
    name: "A",
    category: "international",
    enabled: true,
    status: "unknown",
    rss: null,
    youtube: null,
    homepage: null,
    notes: "some note",
    ...overrides,
  };
}

describe("validateSourceEntry", () => {
  it("accepts a fully valid entry", () => {
    const result = validateSourceEntry(validEntry());
    expect(result.ok).toBe(true);
  });

  it("accepts a valid entry with optional fields omitted entirely", () => {
    const { rss, youtube, homepage, notes, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.rss).toBeNull();
      expect(result.entry.youtube).toBeNull();
      expect(result.entry.homepage).toBeNull();
      expect(result.entry.notes).toBeNull();
    }
  });

  it("rejects an entry that isn't an object (invalid_entry_shape)", () => {
    const result = validateSourceEntry("just a string");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_entry_shape");
  });

  it("rejects a missing required field: id", () => {
    const { id, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("missing_required_field");
  });

  it("rejects a missing required field: name", () => {
    const { name, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("missing_required_field");
  });

  it("rejects a missing required field: category", () => {
    const { category, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("missing_required_field");
  });

  it("rejects a missing required field: enabled", () => {
    const { enabled, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("missing_required_field");
  });

  it("rejects a missing required field: status", () => {
    const { status, ...rest } = validEntry();
    const result = validateSourceEntry(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("missing_required_field");
  });

  it("rejects an invalid category value", () => {
    const result = validateSourceEntry(validEntry({ category: "not-a-real-category" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_field_value");
  });

  it("rejects an invalid status value", () => {
    const result = validateSourceEntry(validEntry({ status: "not-a-real-status" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_field_value");
  });

  it("rejects a wrongly-typed optional field (rss as a number)", () => {
    const result = validateSourceEntry(validEntry({ rss: 12345 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe("invalid_field_value");
  });

  it("accepts null rss and null youtube explicitly", () => {
    const result = validateSourceEntry(validEntry({ rss: null, youtube: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.rss).toBeNull();
      expect(result.entry.youtube).toBeNull();
    }
  });

  it("accepts a real string rss/youtube value", () => {
    const result = validateSourceEntry(validEntry({ rss: "https://example.com/feed.xml", youtube: null }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.rss).toBe("https://example.com/feed.xml");
  });
});

describe("validateSourcesDocument", () => {
  it("validates a mixed batch: valid, missing-field, and disabled entries all handled independently", () => {
    const raw = [
      validEntry({ id: "ok-1" }),
      { name: "Missing id" }, // missing required id
      validEntry({ id: "ok-2", enabled: false }),
    ];
    const { validEntries, errors } = validateSourcesDocument(raw);
    expect(validEntries.map((e) => e.id)).toEqual(["ok-1", "ok-2"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toBe("missing_required_field");
  });

  it("flags a duplicate id, keeping the first occurrence", () => {
    const raw = [validEntry({ id: "dup", name: "First" }), validEntry({ id: "dup", name: "Second" })];
    const { validEntries, errors } = validateSourcesDocument(raw);
    expect(validEntries).toHaveLength(1);
    expect(validEntries[0]!.name).toBe("First");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toBe("duplicate_id");
    expect(errors[0]!.sourceId).toBe("dup");
  });

  it("returns empty results for an empty document", () => {
    const { validEntries, errors } = validateSourcesDocument([]);
    expect(validEntries).toEqual([]);
    expect(errors).toEqual([]);
  });
});
