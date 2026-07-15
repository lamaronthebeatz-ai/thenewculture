# Editorial Configuration Layer

PR #40. This directory separates **editorial configuration** (what
sources exist, how they're grouped, what rules govern crawling/scoring)
from the **collector engine** (`workers/editorial-os/src/collectors/`,
which still owns and runs its own copy of this same data today).

**The Worker does not read these files yet.** They exist as a
standalone configuration layer; wiring the engine to read from here
instead of (or in addition to) `src/collectors/sources.ts` and
`src/config.ts`'s `newsIntelligenceWeights` is deferred to a later,
separate PR. No collector, Worker, Queue, or Dashboard logic changes
with this PR.

## Files

| File | Purpose |
|---|---|
| `sources.yaml` | One row per editorial source: identity, feed URLs (nullable), enable flag, verification status. |
| `source-groups.yaml` | Groups `sources.yaml` ids under the 4 editorial categories. |
| `source-rules.yaml` | Editorial configuration only — crawl interval, network timeout/retry, minimum confidence, tier weights. |

## Schema: `sources.yaml`

Top-level key: `sources` — a list. Each entry:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable, kebab-case, unique. Matches the `id` already used in `src/collectors/sources.ts` for the same source. |
| `name` | string | yes | Display name. |
| `category` | string | yes | One of `international`, `vietnam`, `youtube`, `community`. |
| `homepage` | string \| `null` | yes | Official website URL. `null` if unverified. |
| `rss` | string \| `null` | yes | Official RSS feed URL. `null` if unverified or not applicable. |
| `youtube` | string \| `null` | yes | Official YouTube uploads Atom feed URL (`https://www.youtube.com/feeds/videos.xml?channel_id=...`). `null` if unverified or not applicable. |
| `enabled` | boolean | yes | Whether this source is intended to be active once configured. Independent of `status`/`verified` — a source can be `enabled: true` while still `unknown`/unverified. |
| `status` | string | yes | One of `supported`, `not_supported`, `unknown`. |
| `verified` | boolean | yes | `true` only once a human or tooling has actually confirmed a live feed by fetching it. |
| `verifiedAt` | string (ISO 8601) \| `null` | yes | Timestamp of that verification. `null` until `verified` is `true`. |
| `notes` | string | yes | Human-readable context. Required whenever `rss`/`youtube`/`homepage` is `null`, explaining what still needs verifying. |

**Invariants:**
- No placeholder or guessed URL is ever valid for `homepage`, `rss`, or `youtube` — each must be `null` until independently verified by successfully fetching it.
- If `verified` is `true`, `verifiedAt` must be a non-null timestamp, and at least one of `rss`/`youtube` should be non-null.
- If `status` is `supported`, `verified` must be `true`.

## Schema: `source-groups.yaml`

Top-level key: `groups` — an object keyed by category display name (`International`, `Vietnam`, `YouTube`, `Community`), each value a list of `id` strings.

**Invariants:**
- Every id listed under a group must exist as a `sources[].id` in `sources.yaml`.
- Every id's group must match that source's `sources[].category` in `sources.yaml` (case-insensitively — `International` groups `category: international`, etc.).
- Every `sources.yaml` id must appear in exactly one group.

## Schema: `source-rules.yaml`

Plain editorial configuration, no source-specific data:

| Key | Type | Meaning |
|---|---|---|
| `crawl.intervalMinutes` | number | How often sources are crawled (upper-bounded by the Worker's own Cron Trigger interval). |
| `network.timeoutMs` | number | Per-source fetch timeout. |
| `network.retry` | number | Per-source retry count on failure. |
| `scoring.minimumConfidence` | number (0-100) | Minimum EditorialScore a story needs to enter the Queue. |
| `scoring.tierWeights.tier_1` / `tier_2` / `tier_3` / `unknown` | number (0-100) | Impact score assigned purely from a source's tier. |
| `scoring.freshnessWindowHours` | number | Hours after publish before a story's Freshness score decays to 0. |

## Validation

`workers/editorial-os/test/config/editorialConfig.test.ts` schema-validates all three files (types, enums, required fields, nullability, and the `sources.yaml` ⇄ `source-groups.yaml` cross-reference) using the `yaml` npm package to parse them. This test is new and additive — it does not modify or depend on any existing Worker test, and nothing in `src/` reads these files, so no existing test's behavior changes.
