/**
 * Schema validation for the Editorial Configuration Layer (PR #40,
 * ../../../../editorial-config/). This is a NEW, additive test — it
 * does not modify any existing test, and nothing in src/ reads these
 * YAML files yet (see editorial-config/README.md), so no Worker
 * behavior is exercised here at all: this only validates the shape of
 * the config data itself.
 *
 * The YAML files live outside this Worker project (at the repo root),
 * and this test's own file executes inside workerd (via
 * @cloudflare/vitest-pool-workers), which has no host filesystem
 * access — so the files are pulled in via Vite's `?raw` import
 * (resolved at bundle time, in the Node-side Vite pipeline, long
 * before anything runs inside workerd) rather than `node:fs`.
 */
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import sourcesRaw from "../../../../editorial-config/sources.yaml?raw";
import sourceGroupsRaw from "../../../../editorial-config/source-groups.yaml?raw";
import sourceRulesRaw from "../../../../editorial-config/source-rules.yaml?raw";

const CATEGORIES = ["international", "vietnam", "youtube", "community"] as const;
const STATUSES = ["supported", "not_supported", "unknown"] as const;
const GROUP_NAMES: Record<string, (typeof CATEGORIES)[number]> = {
  International: "international",
  Vietnam: "vietnam",
  YouTube: "youtube",
  Community: "community",
};

interface SourceEntry {
  id: string;
  name: string;
  category: string;
  homepage: string | null;
  rss: string | null;
  youtube: string | null;
  enabled: boolean;
  status: string;
  verified: boolean;
  verifiedAt: string | null;
  notes: string;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

describe("sources.yaml", () => {
  const doc = parse(sourcesRaw) as { sources: SourceEntry[] };

  it("parses to a top-level `sources` array", () => {
    expect(Array.isArray(doc.sources)).toBe(true);
    expect(doc.sources.length).toBeGreaterThan(0);
  });

  it("every entry has the full required field set with correct types", () => {
    for (const source of doc.sources) {
      expect(typeof source.id).toBe("string");
      expect(source.id.length).toBeGreaterThan(0);
      expect(typeof source.name).toBe("string");
      expect(source.name.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(source.category);
      expect(isNullableString(source.homepage)).toBe(true);
      expect(isNullableString(source.rss)).toBe(true);
      expect(isNullableString(source.youtube)).toBe(true);
      expect(typeof source.enabled).toBe("boolean");
      expect(STATUSES).toContain(source.status);
      expect(typeof source.verified).toBe("boolean");
      expect(isNullableString(source.verifiedAt)).toBe(true);
      expect(typeof source.notes).toBe("string");
      expect(source.notes.length).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = doc.sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never ships a placeholder-looking URL", () => {
    const placeholderPattern = /replace_with|todo|xxx|example\.com|<[a-z_]+>/i;
    for (const source of doc.sources) {
      for (const field of [source.homepage, source.rss, source.youtube] as const) {
        if (field !== null) expect(field).not.toMatch(placeholderPattern);
      }
    }
  });

  it("requires non-null verifiedAt whenever verified is true, and vice versa", () => {
    for (const source of doc.sources) {
      expect(source.verified ? source.verifiedAt !== null : source.verifiedAt === null).toBe(true);
    }
  });

  it("requires verified to be true whenever status is supported", () => {
    for (const source of doc.sources) {
      if (source.status === "supported") expect(source.verified).toBe(true);
    }
  });

  it("requires notes whenever a feed/homepage field is null", () => {
    for (const source of doc.sources) {
      if (source.homepage === null || source.rss === null || source.youtube === null) {
        expect(source.notes.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("reflects today's real audit state: every source is unverified and unknown", () => {
    for (const source of doc.sources) {
      expect(source.status).toBe("unknown");
      expect(source.verified).toBe(false);
      expect(source.verifiedAt).toBeNull();
      expect(source.homepage).toBeNull();
      expect(source.rss).toBeNull();
      expect(source.youtube).toBeNull();
    }
  });
});

describe("source-groups.yaml", () => {
  const sourcesDoc = parse(sourcesRaw) as { sources: SourceEntry[] };
  const groupsDoc = parse(sourceGroupsRaw) as { groups: Record<string, string[]> };

  it("parses to a top-level `groups` object with exactly the 4 expected category names", () => {
    expect(Object.keys(groupsDoc.groups).sort()).toEqual(Object.keys(GROUP_NAMES).sort());
  });

  it("every grouped id exists in sources.yaml, and its category matches the group", () => {
    const byId = new Map(sourcesDoc.sources.map((s) => [s.id, s]));
    for (const [groupName, ids] of Object.entries(groupsDoc.groups)) {
      for (const id of ids) {
        const source = byId.get(id);
        expect(source, `group "${groupName}" references unknown id "${id}"`).toBeDefined();
        expect(source!.category).toBe(GROUP_NAMES[groupName]);
      }
    }
  });

  it("every source.yaml id appears in exactly one group", () => {
    const allGroupedIds = Object.values(groupsDoc.groups).flat();
    expect(new Set(allGroupedIds).size).toBe(allGroupedIds.length); // no duplicates across/within groups
    expect(new Set(allGroupedIds)).toEqual(new Set(sourcesDoc.sources.map((s) => s.id)));
  });
});

describe("source-rules.yaml", () => {
  const doc = parse(sourceRulesRaw) as {
    crawl: { intervalMinutes: number };
    network: { timeoutMs: number; retry: number };
    scoring: {
      minimumConfidence: number;
      tierWeights: Record<string, number>;
      freshnessWindowHours: number;
    };
  };

  it("contains only plain editorial configuration numbers, no source-specific data", () => {
    expect(typeof doc.crawl.intervalMinutes).toBe("number");
    expect(doc.crawl.intervalMinutes).toBeGreaterThan(0);

    expect(typeof doc.network.timeoutMs).toBe("number");
    expect(doc.network.timeoutMs).toBeGreaterThan(0);
    expect(typeof doc.network.retry).toBe("number");
    expect(doc.network.retry).toBeGreaterThanOrEqual(0);

    expect(typeof doc.scoring.minimumConfidence).toBe("number");
    expect(doc.scoring.minimumConfidence).toBeGreaterThanOrEqual(0);
    expect(doc.scoring.minimumConfidence).toBeLessThanOrEqual(100);

    expect(typeof doc.scoring.freshnessWindowHours).toBe("number");
    expect(doc.scoring.freshnessWindowHours).toBeGreaterThan(0);
  });

  it("has all 4 tier weights, each a number in [0, 100]", () => {
    for (const tier of ["tier_1", "tier_2", "tier_3", "unknown"]) {
      expect(doc.scoring.tierWeights).toHaveProperty(tier);
      expect(typeof doc.scoring.tierWeights[tier]).toBe("number");
      expect(doc.scoring.tierWeights[tier]).toBeGreaterThanOrEqual(0);
      expect(doc.scoring.tierWeights[tier]).toBeLessThanOrEqual(100);
    }
  });

  it("orders tier weights strictly descending (tier_1 most impactful)", () => {
    const w = doc.scoring.tierWeights;
    expect(w.tier_1!).toBeGreaterThan(w.tier_2!);
    expect(w.tier_2!).toBeGreaterThan(w.tier_3!);
    expect(w.tier_3!).toBeGreaterThan(w.unknown!);
  });
});
