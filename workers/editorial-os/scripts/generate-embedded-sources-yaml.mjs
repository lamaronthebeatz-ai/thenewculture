import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const canonicalPath = join(__dirname, "../../../editorial-config/sources.yaml");
const outPath = join(__dirname, "../src/config-loader/embeddedSourcesYaml.generated.ts");

const content = readFileSync(canonicalPath, "utf-8");

const header = `/**
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *   node scripts/generate-embedded-sources-yaml.mjs
 *
 * Embedded snapshot of /editorial-config/sources.yaml (PR #40), the
 * canonical, human-edited source of truth for the Editorial Source
 * Registry.
 *
 * WHY A SNAPSHOT INSTEAD OF A DIRECT IMPORT: editorial-config/ lives
 * outside this Worker project's root (a sibling of workers/editorial-os/,
 * by design — see editorial-config/README.md). @cloudflare/vitest-pool-workers
 * cannot resolve a wrangler.toml [[rules]]-typed module (needed so
 * wrangler deploy's esbuild bundler can import a .yaml file as raw text
 * at all) when that file is outside the project root — verified
 * directly: adding such a rule made every .yaml import fail in tests
 * (including files that imported it correctly before the rule existed),
 * for every test file in the suite, not just ones that touch this
 * config. See
 * https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution.
 *
 * So instead: this is a plain, ordinary .ts module (no bundler magic
 * needed, works identically in wrangler deploy and in tests) containing
 * an exact copy of sources.yaml's text. Keeping it in sync is enforced
 * by test/config/editorialConfig.test.ts's "schema regression" test,
 * which compares this constant against the live file (imported via
 * Vite's ?raw, which does work for out-of-root test-side imports as
 * long as no wrangler.toml rule is involved) and fails loudly the
 * moment they drift.
 */
export const EMBEDDED_SOURCES_YAML = `;

const out = `${header}${JSON.stringify(content)};\n`;
writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes)`);
