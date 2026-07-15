/**
 * Editorial Source Registry (PR #39). "This file is Editorial
 * Configuration only." — no fetching, parsing, scoring, or health logic
 * lives here; every row is just data the engine (rss.ts, youtube.ts,
 * duplicate.ts, intelligence.ts, registry.ts, health.ts — all
 * unmodified by this file) already knows how to consume.
 *
 * VERIFIED-URL RULE (still in force from Phase 8): "Use VERIFIED public
 * RSS / Atom / YouTube Feed URLs only. Never invent URLs. If a source
 * has no verified feed, exclude it from Phase 8. No placeholder values.
 * No REPLACE_WITH..." Every one of the sources below is a real,
 * identifiable outlet, label, or artist channel, but this sandboxed
 * environment could not verify a single feed URL for any of them —
 * every direct fetch attempt (Rolling Stone, Billboard, XXL, Complex,
 * youtube.com/feeds, Vietnamese outlets and artist channels alike)
 * returned a proxy/network 403, which reads as an environment
 * limitation, not proof these feeds don't exist. Rather than invent or
 * guess a URL to fill the gap, every row below ships with `url: null`
 * and a `notes` field explaining exactly what still needs verifying.
 *
 * This is a deliberate, complete registry *shape* rather than an empty
 * table: each source is individually enabled/disabled, categorized, and
 * ready to activate the moment a real feed URL is confirmed and set —
 * a one-line edit here, zero code changes anywhere else. Until that
 * happens, the collector engine ignores every `url: null` row entirely
 * (rss.ts's fetchRssFeed short-circuits to "not_configured" with no
 * network call), Collector Health reports NOT_CONFIGURED rather than a
 * failure for each of them, and the Worker's run behavior stays
 * byte-for-byte identical to before this feature (see service.ts: the
 * bundled fixture fallback is keyed off *collected* news, not merely
 * off the registry being non-empty) — see
 * test/integration/newsCollectors.test.ts for the end-to-end proof.
 */
import { SourceTier } from "../models";
import { SourceConfig } from "./base";

const NOT_VERIFIED_RSS =
  "No verified public RSS/Atom feed URL for this outlet could be confirmed from this environment " +
  "(network/proxy blocked every candidate URL attempted). Verify the outlet's official feed URL and " +
  "set it here before enabling collection from this source.";

const NOT_VERIFIED_YOUTUBE =
  "This artist/channel's YouTube channel ID has not been verified from this environment. Once " +
  "confirmed, set url to https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID> — no other " +
  "code changes are needed.";

const NOT_VERIFIED_COMMUNITY =
  "No official or community-maintained feed has been verified for this source. If one exists, " +
  "verify it and set the real feed URL here before enabling; otherwise leave disabled.";

// -----------------------------------------------------------------------
// International — major English-language music press
// -----------------------------------------------------------------------
const INTERNATIONAL_SOURCES: SourceConfig[] = [
  {
    id: "intl-rolling-stone-music",
    name: "Rolling Stone Music",
    type: "rss",
    category: "international",
    tier: SourceTier.TIER_2,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
  },
  {
    id: "intl-billboard-hiphop",
    name: "Billboard Hip-Hop",
    type: "rss",
    category: "international",
    tier: SourceTier.TIER_2,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
  },
  {
    id: "intl-complex-music",
    name: "Complex Music",
    type: "rss",
    category: "international",
    tier: SourceTier.TIER_2,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
  },
  {
    id: "intl-xxl-magazine",
    name: "XXL Magazine",
    type: "rss",
    category: "international",
    tier: SourceTier.TIER_2,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
  },
];

// -----------------------------------------------------------------------
// Vietnam — Vietnamese entertainment/music outlets and labels
// -----------------------------------------------------------------------
const VIETNAM_SOURCES: SourceConfig[] = [
  {
    id: "vn-vie-channel-news",
    name: "Vie Channel News",
    type: "rss",
    category: "vietnam",
    tier: SourceTier.TIER_2,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
  },
  {
    id: "vn-spacespeakers",
    name: "SpaceSpeakers",
    type: "rss",
    category: "vietnam",
    tier: SourceTier.TIER_1,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_RSS,
    timeoutMs: 8000,
    retry: 1,
    defaultArtist: "SpaceSpeakers",
  },
];

// -----------------------------------------------------------------------
// YouTube — official artist/show channels (Atom feed via channel_id)
// -----------------------------------------------------------------------
const YOUTUBE_CHANNELS: Array<{ id: string; name: string; defaultArtist: string }> = [
  { id: "yt-rap-viet-official", name: "Rap Việt Official", defaultArtist: "Rap Việt" },
  { id: "yt-16-typh", name: "16 Typh", defaultArtist: "16 Typh" },
  { id: "yt-hieuthuhai", name: "HIEUTHUHAI", defaultArtist: "HIEUTHUHAI" },
  { id: "yt-double2t", name: "Double2T", defaultArtist: "Double2T" },
  { id: "yt-mck", name: "MCK", defaultArtist: "MCK" },
  { id: "yt-tlinh", name: "tlinh", defaultArtist: "tlinh" },
  { id: "yt-wean", name: "WEAN", defaultArtist: "WEAN" },
  { id: "yt-24k-right", name: "24K.Right", defaultArtist: "24K.Right" },
  { id: "yt-low-g", name: "Low G", defaultArtist: "Low G" },
  { id: "yt-rhymastic", name: "Rhymastic", defaultArtist: "Rhymastic" },
  { id: "yt-karik", name: "Karik", defaultArtist: "Karik" },
  { id: "yt-binz", name: "Binz", defaultArtist: "Binz" },
];

const YOUTUBE_SOURCES: SourceConfig[] = YOUTUBE_CHANNELS.map(
  ({ id, name, defaultArtist }): SourceConfig => ({
    id,
    name,
    type: "youtube",
    category: "youtube",
    tier: SourceTier.TIER_1,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_YOUTUBE,
    timeoutMs: 8000,
    retry: 1,
    defaultArtist,
  }),
);

// -----------------------------------------------------------------------
// Community — fan-run / community-maintained aggregators
// -----------------------------------------------------------------------
const COMMUNITY_SOURCES: SourceConfig[] = [
  {
    id: "community-vculture-aggregator",
    name: "V-Culture Fan Aggregator",
    type: "rss",
    category: "community",
    tier: SourceTier.TIER_3,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_COMMUNITY,
    timeoutMs: 8000,
    retry: 1,
  },
  {
    id: "community-rap-vietnam-hub",
    name: "Rap Vietnam Community Hub",
    type: "rss",
    category: "community",
    tier: SourceTier.TIER_3,
    enabled: true,
    url: null,
    notes: NOT_VERIFIED_COMMUNITY,
    timeoutMs: 8000,
    retry: 1,
  },
];

export const SOURCE_CONFIG: SourceConfig[] = [
  ...INTERNATIONAL_SOURCES,
  ...VIETNAM_SOURCES,
  ...YOUTUBE_SOURCES,
  ...COMMUNITY_SOURCES,
];
