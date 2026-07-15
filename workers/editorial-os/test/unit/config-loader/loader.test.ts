import { describe, expect, it } from "vitest";
import { parseSourcesYaml } from "../../../src/config-loader/loader";

describe("parseSourcesYaml", () => {
  it("parses a valid document into rawEntries with no documentError", () => {
    const yaml = `
sources:
  - id: a
    name: A
    category: international
    enabled: true
    status: unknown
`;
    const { rawEntries, documentError } = parseSourcesYaml(yaml);
    expect(documentError).toBeNull();
    expect(rawEntries).toHaveLength(1);
    expect(rawEntries[0]).toMatchObject({ id: "a", name: "A" });
  });

  it("returns invalid_yaml (never throws) for malformed YAML syntax", () => {
    const malformed = "sources:\n  - id: a\n  name: [unterminated";
    const { rawEntries, documentError } = parseSourcesYaml(malformed);
    expect(rawEntries).toEqual([]);
    expect(documentError?.reason).toBe("invalid_yaml");
    expect(documentError?.sourceId).toBeNull();
  });

  it("returns invalid_schema when the document has no `sources` key", () => {
    const { documentError } = parseSourcesYaml("foo: bar");
    expect(documentError?.reason).toBe("invalid_schema");
  });

  it("returns invalid_schema when `sources` is not a list", () => {
    const { documentError } = parseSourcesYaml("sources: not-a-list");
    expect(documentError?.reason).toBe("invalid_schema");
  });

  it("returns invalid_schema for a document that parses to a scalar, not a mapping", () => {
    const { documentError } = parseSourcesYaml("just a string");
    expect(documentError?.reason).toBe("invalid_schema");
  });

  it("handles an empty `sources: []` document as zero entries, no error", () => {
    const { rawEntries, documentError } = parseSourcesYaml("sources: []");
    expect(documentError).toBeNull();
    expect(rawEntries).toEqual([]);
  });
});
