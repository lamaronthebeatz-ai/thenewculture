/**
 * config-loader errors (PR #41). Every failure mode here is DATA, not
 * a thrown exception — "No source may crash Worker" — so a ConfigError
 * is a plain object, collected into a list and surfaced as a
 * Collector Health "config_error" entry (see factory.ts), the same way
 * a bad HTTP response becomes a CollectorFetchResult instead of a
 * throw in src/collectors/rss.ts.
 */
export type ConfigErrorReason =
  | "invalid_yaml"
  | "invalid_schema"
  | "invalid_entry_shape"
  | "missing_required_field"
  | "invalid_field_value"
  | "duplicate_id";

export interface ConfigError {
  /** The offending entry's id, when known. null for document-level
   * errors (invalid_yaml/invalid_schema) or when the entry's own `id`
   * field is itself missing/malformed. */
  sourceId: string | null;
  reason: ConfigErrorReason;
  message: string;
}
