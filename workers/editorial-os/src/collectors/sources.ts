/**
 * Source configuration table (Phase 8). "Never hardcode inside
 * collectors. Create one configuration table." — this is that table.
 *
 * SHIPPED EMPTY, DELIBERATELY. The spec requires "Use VERIFIED public
 * RSS / Atom / YouTube Feed URLs only. Never invent URLs. If a source
 * has no verified feed, exclude it from Phase 8. No placeholder values.
 * No REPLACE_WITH..." Every attempt to verify a real feed URL for the
 * 18 named sources (Rap Việt Official, Vie Channel News, SpaceSpeakers,
 * 16 Typh, HIEUTHUHAI, Double2T, MCK, tlinh, WEAN, 24K.Right, Low G,
 * Rhymastic, Karik, Binz, Rolling Stone Music, Billboard Hip-Hop,
 * Complex Music, XXL Magazine) from this environment was blocked with
 * HTTP 403 — both direct fetch and Cloudflare's youtube.com/feeds
 * endpoint — which reads as network/bot-protection in this sandbox, not
 * proof the feeds don't exist. Since that can't be told apart from here,
 * and the spec explicitly forbids shipping an unverified or invented
 * URL, this table ships with zero entries rather than a guess.
 *
 * The engine (rss.ts, youtube.ts, duplicate.ts, intelligence.ts,
 * registry.ts, health.ts) is fully implemented and tested against
 * synthetic fixture feeds — see test/unit/collectors/ and
 * test/integration/newsCollectors.test.ts. Adding a real source is a
 * one-entry addition here, following SourceConfig's shape exactly —
 * no code changes anywhere else.
 *
 * Until an entry is added, the Worker's collection behavior is
 * unchanged from before this feature: service.ts falls back to the
 * existing bundled fixture events (see providers.ts's NewsProvider).
 */
import { SourceConfig } from "./base";

export const SOURCE_CONFIG: SourceConfig[] = [];
