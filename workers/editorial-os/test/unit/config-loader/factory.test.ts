import { describe, expect, it } from "vitest";
import { SourceTier } from "../../../src/models";
import {
  configErrorToHealthEntry,
  defaultTierForCategory,
  loadSourceConfigFromYaml,
  validatedEntryToSourceConfigs,
} from "../../../src/config-loader/factory";
import { ValidatedSourceEntry } from "../../../src/config-loader/types";

function validated(overrides: Partial<ValidatedSourceEntry> = {}): ValidatedSourceEntry {
  return {
    id: "src-1",
    name: "Source One",
    category: "international",
    enabled: true,
    status: "unknown",
    homepage: null,
    rss: null,
    youtube: null,
    notes: null,
    ...overrides,
  };
}

describe("defaultTierForCategory", () => {
  it("maps youtube -> tier_1, community -> tier_3, international/vietnam -> tier_2", () => {
    expect(defaultTierForCategory("youtube")).toBe(SourceTier.TIER_1);
    expect(defaultTierForCategory("community")).toBe(SourceTier.TIER_3);
    expect(defaultTierForCategory("international")).toBe(SourceTier.TIER_2);
    expect(defaultTierForCategory("vietnam")).toBe(SourceTier.TIER_2);
  });
});

describe("validatedEntryToSourceConfigs", () => {
  it("produces zero rows for a disabled source, even with real feed URLs set", () => {
    const rows = validatedEntryToSourceConfigs(
      validated({ enabled: false, rss: "https://example.com/feed.xml", youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=X" }),
    );
    expect(rows).toEqual([]);
  });

  it("produces zero rows when both rss and youtube are null (ignored)", () => {
    const rows = validatedEntryToSourceConfigs(validated({ rss: null, youtube: null }));
    expect(rows).toEqual([]);
  });

  it("produces exactly one rss-type row when only rss is set", () => {
    const rows = validatedEntryToSourceConfigs(validated({ rss: "https://example.com/feed.xml", youtube: null }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "src-1-rss", type: "rss", url: "https://example.com/feed.xml", enabled: true });
  });

  it("produces exactly one youtube-type row when only youtube is set", () => {
    const rows = validatedEntryToSourceConfigs(
      validated({ category: "youtube", rss: null, youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=X" }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "src-1-youtube", type: "youtube", url: "https://www.youtube.com/feeds/videos.xml?channel_id=X" });
    expect(rows[0]!.defaultArtist).toBe("Source One"); // youtube category -> defaultArtist = name
  });

  it("produces two rows (rss and youtube) when both feed fields are set", () => {
    const rows = validatedEntryToSourceConfigs(
      validated({ rss: "https://example.com/feed.xml", youtube: "https://www.youtube.com/feeds/videos.xml?channel_id=X" }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type).sort()).toEqual(["rss", "youtube"]);
  });

  it("does not set defaultArtist for non-youtube categories", () => {
    const rows = validatedEntryToSourceConfigs(validated({ category: "community", rss: "https://example.com/feed.xml" }));
    expect(rows[0]!.defaultArtist).toBeUndefined();
  });
});

describe("configErrorToHealthEntry", () => {
  it("maps a ConfigError into a config_error health entry with no timestamps", () => {
    const entry = configErrorToHealthEntry({ sourceId: "bad-1", reason: "missing_required_field", message: "oops" });
    expect(entry).toMatchObject({ sourceId: "bad-1", status: "config_error", lastSuccess: null, lastFailure: null, itemsCollected: 0, retryCount: 0 });
  });

  it("falls back to <unknown> for a document-level error with no sourceId", () => {
    const entry = configErrorToHealthEntry({ sourceId: null, reason: "invalid_yaml", message: "oops" });
    expect(entry.sourceId).toBe("<unknown>");
  });
});

describe("loadSourceConfigFromYaml", () => {
  it("valid configuration: parses, validates, and converts a well-formed document end to end", () => {
    const yaml = `
sources:
  - id: outlet-a
    name: Outlet A
    category: international
    enabled: true
    status: unknown
    rss: https://a.example.com/feed.xml
  - id: artist-b
    name: Artist B
    category: youtube
    enabled: true
    status: unknown
    youtube: https://www.youtube.com/feeds/videos.xml?channel_id=UCxyz
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.configErrors).toEqual([]);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.find((s) => s.id === "outlet-a-rss")).toMatchObject({ type: "rss", url: "https://a.example.com/feed.xml" });
    expect(result.sources.find((s) => s.id === "artist-b-youtube")).toMatchObject({ type: "youtube", defaultArtist: "Artist B" });
  });

  it("invalid yaml: a syntax error never throws, and surfaces as one config_error health entry", () => {
    const result = loadSourceConfigFromYaml("sources:\n  - id: a\n  name: [unterminated");
    expect(result.sources).toEqual([]);
    expect(result.configErrors).toHaveLength(1);
    expect(result.configErrors[0]!.reason).toBe("invalid_yaml");
    expect(result.configErrorHealth).toHaveLength(1);
    expect(result.configErrorHealth[0]!.status).toBe("config_error");
  });

  it("missing field: one bad row produces a config_error without preventing the rest from loading", () => {
    const yaml = `
sources:
  - name: Missing Id
    category: international
    enabled: true
    status: unknown
  - id: good
    name: Good Source
    category: international
    enabled: true
    status: unknown
    rss: https://good.example.com/feed.xml
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.configErrors).toHaveLength(1);
    expect(result.configErrors[0]!.reason).toBe("missing_required_field");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ id: "good-rss" });
  });

  it("disabled source: an enabled: false row with a real url still produces zero collectors", () => {
    const yaml = `
sources:
  - id: off
    name: Off Source
    category: international
    enabled: false
    status: unknown
    rss: https://off.example.com/feed.xml
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.sources).toEqual([]);
    expect(result.configErrors).toEqual([]);
  });

  it("null rss: a row with only youtube set produces no rss collector", () => {
    const yaml = `
sources:
  - id: yt-only
    name: YT Only
    category: youtube
    enabled: true
    status: unknown
    youtube: https://www.youtube.com/feeds/videos.xml?channel_id=UCabc
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.type).toBe("youtube");
  });

  it("null youtube: a row with only rss set produces no youtube collector", () => {
    const yaml = `
sources:
  - id: rss-only
    name: RSS Only
    category: international
    enabled: true
    status: unknown
    rss: https://rss-only.example.com/feed.xml
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.type).toBe("rss");
  });

  it("mixed configuration: enabled+configured, disabled, unconfigured, and invalid rows are each handled correctly in one document", () => {
    const yaml = `
sources:
  - id: configured
    name: Configured
    category: international
    enabled: true
    status: unknown
    rss: https://configured.example.com/feed.xml
  - id: disabled
    name: Disabled
    category: international
    enabled: false
    status: unknown
    rss: https://disabled.example.com/feed.xml
  - id: unconfigured
    name: Unconfigured
    category: vietnam
    enabled: true
    status: unknown
  - category: international
    enabled: true
    status: unknown
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.id).toBe("configured-rss");
    expect(result.configErrors).toHaveLength(1);
    expect(result.configErrors[0]!.reason).toBe("missing_required_field");
  });

  it("duplicate ids: the second occurrence is excluded and reported, the first still loads", () => {
    const yaml = `
sources:
  - id: dup
    name: First
    category: international
    enabled: true
    status: unknown
    rss: https://first.example.com/feed.xml
  - id: dup
    name: Second
    category: international
    enabled: true
    status: unknown
    rss: https://second.example.com/feed.xml
`;
    const result = loadSourceConfigFromYaml(yaml);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ url: "https://first.example.com/feed.xml" });
    expect(result.configErrors).toHaveLength(1);
    expect(result.configErrors[0]!.reason).toBe("duplicate_id");
  });
});
