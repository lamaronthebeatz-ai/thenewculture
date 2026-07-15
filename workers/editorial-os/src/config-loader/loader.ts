/**
 * config-loader/loader.ts (PR #41) — turns the raw text of
 * editorial-config/sources.yaml into an array of untyped row objects.
 * This is the only file in config-loader/ that touches YAML syntax;
 * everything after this point works with plain JS values. Never
 * throws: a syntax error or an unexpected top-level shape becomes a
 * document-level ConfigError instead ("No source may crash Worker").
 */
import { parse } from "yaml";
import { ConfigError } from "./errors";
import { RawSourceEntry } from "./types";

export interface ParsedSourcesDocument {
  rawEntries: RawSourceEntry[];
  documentError: ConfigError | null;
}

export function parseSourcesYaml(rawYamlText: string): ParsedSourcesDocument {
  let parsed: unknown;
  try {
    parsed = parse(rawYamlText);
  } catch (err) {
    return {
      rawEntries: [],
      documentError: {
        sourceId: null,
        reason: "invalid_yaml",
        message: `Failed to parse editorial-config/sources.yaml: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("sources" in parsed)) {
    return {
      rawEntries: [],
      documentError: {
        sourceId: null,
        reason: "invalid_schema",
        message: "editorial-config/sources.yaml must have a top-level `sources` list.",
      },
    };
  }

  const sources = (parsed as { sources: unknown }).sources;
  if (!Array.isArray(sources)) {
    return {
      rawEntries: [],
      documentError: {
        sourceId: null,
        reason: "invalid_schema",
        message: "editorial-config/sources.yaml's `sources` key must be a list.",
      },
    };
  }

  return { rawEntries: sources as RawSourceEntry[], documentError: null };
}
