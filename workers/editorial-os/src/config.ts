/**
 * Config — 1:1 port of every YAML file under editorial-intelligence/config/
 * plus editorial-intelligence/workers/worker.yaml. Cloudflare Workers have
 * no filesystem, so these can't be loaded from disk at runtime the way
 * config/loader.py's `yaml.safe_load()` does — every value below is typed
 * out verbatim from the real YAML instead. Nothing here is a rule change:
 * nothing was renamed, retuned, or reordered — this is the same data,
 * declared in TypeScript instead of read from a file at runtime.
 */
import { EventType, StoryType } from "./models";

// ---------------------------------------------------------------------
// confidence_weights.yaml (events/confidence.py)
// ---------------------------------------------------------------------

export const confidenceWeights = {
  sourceWeights: {
    "Official Website": 50,
    "Spotify Artist": 20,
    "Apple Music Artist": 20,
    "Spotify Releases": 20,
    "Apple Music Releases": 20,
    "YouTube Official": 15,
    "Facebook Verified": 10,
  } as Record<string, number>,
  defaultTierWeights: {
    tier_1: 10,
    tier_2: 7,
    tier_3: 4,
    unknown: 2,
  } as Record<string, number>,
  duplicateSourceBonus: 5,
  promptEligibilityThreshold: 50,
};

// ---------------------------------------------------------------------
// sources.yaml (Source Registry) -> flattened name -> tier lookup, same
// shape config/loader.py's source_tier_lookup() produces.
// ---------------------------------------------------------------------

export const sourceTierLookup: Record<string, string> = {
  "Official Artist": "tier_1",
  "Spotify Artist": "tier_1",
  "Apple Music Artist": "tier_1",
  "YouTube Official": "tier_1",
  "Facebook Verified": "tier_1",
  "Instagram Verified": "tier_1",
  "Official Website": "tier_1",
  "Billboard Vietnam": "tier_2",
  "Vietcetera Music": "tier_2",
  "Official Labels": "tier_2",
  "Festival Organizers": "tier_2",
  "Spotify Releases": "tier_3",
  "Apple Music Releases": "tier_3",
  "YouTube Music": "tier_3",
};

// ---------------------------------------------------------------------
// editorial_mapping.yaml (events/mapping.py's suggest_series())
// ---------------------------------------------------------------------

export const editorialMapping: Record<string, string> = {
  [EventType.ALBUM_RELEASE]: "tnc-records",
  [EventType.SINGLE_RELEASE]: "tnc-tracks",
  [EventType.MV_RELEASE]: "tnc-tracks",
  [EventType.ARTIST_ANNOUNCEMENT]: "tnc-profiles",
  [EventType.FESTIVAL]: "tnc-radar",
  [EventType.CONCERT]: "tnc-radar",
  [EventType.INTERVIEW]: "inside-the-culture",
  [EventType.AWARD]: "tnc-timeline",
  [EventType.COMMUNITY_EVENT]: "tnc-community",
};

// ---------------------------------------------------------------------
// event_categories.yaml (events/mapping.py's apply_full())
// ---------------------------------------------------------------------

export const eventCategories = {
  categories: {
    [EventType.ALBUM_RELEASE]: "Release",
    [EventType.SINGLE_RELEASE]: "Release",
    [EventType.MV_RELEASE]: "Release",
    [EventType.ARTIST_ANNOUNCEMENT]: "Announcement",
    [EventType.FESTIVAL]: "Live Event",
    [EventType.CONCERT]: "Live Event",
    [EventType.INTERVIEW]: "Editorial",
    [EventType.AWARD]: "Milestone",
    [EventType.COMMUNITY_EVENT]: "Community",
  } as Record<string, string>,
  relatedSeries: {
    [EventType.ALBUM_RELEASE]: ["tnc-reviews"],
    [EventType.SINGLE_RELEASE]: ["tnc-selects"],
    [EventType.MV_RELEASE]: ["tnc-culture"],
    [EventType.ARTIST_ANNOUNCEMENT]: ["tnc-radar"],
    [EventType.FESTIVAL]: ["tnc-community"],
    [EventType.CONCERT]: ["tnc-community"],
    [EventType.INTERVIEW]: ["tnc-profiles"],
    [EventType.AWARD]: ["tnc-timeline"],
    [EventType.COMMUNITY_EVENT]: ["tnc-radar"],
  } as Record<string, string[]>,
  homepageEligibleEventTypes: [EventType.ALBUM_RELEASE, EventType.FESTIVAL, EventType.ARTIST_ANNOUNCEMENT] as string[],
  homepageConfidenceThreshold: 70,
  magazineEligibleEventTypes: [
    EventType.ALBUM_RELEASE,
    EventType.SINGLE_RELEASE,
    EventType.MV_RELEASE,
    EventType.FESTIVAL,
    EventType.INTERVIEW,
    EventType.AWARD,
  ] as string[],
  magazineConfidenceThreshold: 50,
  searchWeightBase: 10,
  searchWeightConfidenceMultiplier: 0.5,
};

// ---------------------------------------------------------------------
// story_classification.yaml (editorial/story.py)
// ---------------------------------------------------------------------

export const storyClassification = {
  defaultByEventType: {
    [EventType.ALBUM_RELEASE]: StoryType.RELEASE,
    [EventType.SINGLE_RELEASE]: StoryType.RELEASE,
    [EventType.MV_RELEASE]: StoryType.RELEASE,
    [EventType.ARTIST_ANNOUNCEMENT]: StoryType.DISCOVERY,
    [EventType.FESTIVAL]: StoryType.COMMUNITY,
    [EventType.CONCERT]: StoryType.COMMUNITY,
    [EventType.INTERVIEW]: StoryType.INTERVIEW,
    [EventType.AWARD]: StoryType.TIMELINE,
    [EventType.COMMUNITY_EVENT]: StoryType.COMMUNITY,
  } as Record<string, StoryType>,
  breakingEligibleEventTypes: [
    EventType.ALBUM_RELEASE,
    EventType.SINGLE_RELEASE,
    EventType.MV_RELEASE,
    EventType.ARTIST_ANNOUNCEMENT,
  ] as string[],
  breakingWithinDays: 2,
  breakingMinConfidence: 70,
};

// ---------------------------------------------------------------------
// priority_weights.yaml (editorial/priority.py)
// ---------------------------------------------------------------------

export const priorityWeights = {
  storyTypeWeights: {
    [StoryType.BREAKING]: 100,
    [StoryType.RELEASE]: 60,
    [StoryType.DISCOVERY]: 55,
    [StoryType.FEATURE]: 55,
    [StoryType.INTERVIEW]: 50,
    [StoryType.REVIEW]: 45,
    [StoryType.PROFILE]: 40,
    [StoryType.TIMELINE]: 35,
    [StoryType.EDITORIAL]: 25,
    [StoryType.COMMUNITY]: 25,
  } as Record<string, number>,
  confidenceMultiplier: 0.3,
  homepageBonus: 20,
  magazineBonus: 10,
};

// ---------------------------------------------------------------------
// editorial_decision.yaml (editorial/decision.py)
// ---------------------------------------------------------------------

export const editorialDecisionRules = {
  publishPriorityThreshold: 70,
  holdPriorityThreshold: 30,
};

// ---------------------------------------------------------------------
// assignment_rules.yaml (editorial/assignment.py)
// ---------------------------------------------------------------------

export const assignmentRules = {
  suggestedLengthByStoryType: {
    [StoryType.BREAKING]: "150-300",
    [StoryType.RELEASE]: "400-600",
    [StoryType.FEATURE]: "800-1200",
    [StoryType.INTERVIEW]: "1000-1500",
    [StoryType.REVIEW]: "600-900",
    [StoryType.PROFILE]: "500-800",
    [StoryType.TIMELINE]: "400-600",
    [StoryType.DISCOVERY]: "400-600",
    [StoryType.COMMUNITY]: "300-500",
    [StoryType.EDITORIAL]: "700-1000",
  } as Record<string, string>,
};

// ---------------------------------------------------------------------
// cover_story_rules.yaml (editorial/cover_story.py)
// ---------------------------------------------------------------------

export const coverStoryRules = {
  eligibleStoryTypes: [StoryType.BREAKING, StoryType.RELEASE, StoryType.FEATURE] as string[],
  minPriorityScore: 70,
};

// ---------------------------------------------------------------------
// issue_balance.yaml (editorial/issue_planner.py)
// ---------------------------------------------------------------------

export const issueBalance = {
  targetDistribution: {
    "tnc-origins": 2,
    "tnc-profiles": 2,
    "tnc-records": 3,
    "tnc-tracks": 2,
    "tnc-breakdown": 2,
    "tnc-editorial": 1,
    "tnc-reviews": 2,
    "tnc-timeline": 1,
    "tnc-culture": 1,
    "inside-the-culture": 1,
    "tnc-community": 2,
    "tnc-radar": 2,
    "tnc-discovery": 2,
    "tnc-music-101": 1,
    "tnc-selects": 1,
    "behind-the-culture": 1,
  } as Record<string, number>,
  defaultTarget: 1,
};

// ---------------------------------------------------------------------
// dashboard_config.yaml (editorial/dashboard.py)
// ---------------------------------------------------------------------

export const dashboardConfig = {
  highPriorityThreshold: 70,
};

// ---------------------------------------------------------------------
// workers/worker.yaml (Phase 6 Worker Config) — Phase 8's cron is fixed
// at "*/30 * * * *" in wrangler.toml, so `schedule.mode` here is kept
// only for the `Scheduler`/HealthEngine port's own rule-fidelity (same
// manual/hourly/daily/weekly vocabulary as Python) — the Cloudflare Cron
// Trigger is the actual scheduler once deployed.
// ---------------------------------------------------------------------

export const workerConfig = {
  schedule: { mode: "hourly" as "manual" | "hourly" | "daily" | "weekly" },
  providers: { fixturesDir: null as string | null },
  limits: { maxEventsPerRun: 50 },
  retry: { maxAttempts: 1, backoffSeconds: 0 },
  logging: { level: "info" as "debug" | "info" | "warning" | "error" },
};
