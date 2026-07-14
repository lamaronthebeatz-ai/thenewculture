"""
Closed vocabularies for Editorial Intelligence.

Kept as plain `Enum`s (not free-form strings) so a bad value fails fast at
construction time instead of silently drifting through the pipeline.
"""
from enum import Enum


class EventType(str, Enum):
    """The kinds of editorial events this system understands.

    Extending the list (e.g. a new "Documentary" event) is a one-line
    addition here plus one line in config/editorial_mapping.yaml — no
    other file needs to change. See section IX (Editorial Mapping)."""

    ALBUM_RELEASE = "album_release"
    SINGLE_RELEASE = "single_release"
    MV_RELEASE = "mv_release"
    ARTIST_ANNOUNCEMENT = "artist_announcement"
    FESTIVAL = "festival"
    CONCERT = "concert"
    INTERVIEW = "interview"
    AWARD = "award"
    COMMUNITY_EVENT = "community_event"


class EventStatus(str, Enum):
    """Lifecycle of a single Editorial Event inside the queue.

    DISCOVERED        -- just came out of a Provider, not yet scored.
    LOW_CONFIDENCE     -- scored, but below the prompt-eligibility
                          threshold (see events/confidence.py). Held back,
                          never reaches the Prompt Generator on its own.
    PENDING_REVIEW     -- scored above threshold, deduplicated, waiting
                          for an editor to request a Prompt.
    MERGED             -- absorbed into another Event by the Duplicate
                          Engine; kept for audit, excluded from the queue.
    PROMPTED           -- a Prompt has been generated for this Event.
    REJECTED           -- an editor explicitly discarded it.
    """

    DISCOVERED = "discovered"
    LOW_CONFIDENCE = "low_confidence"
    PENDING_REVIEW = "pending_review"
    MERGED = "merged"
    PROMPTED = "prompted"
    REJECTED = "rejected"


class SourceTier(str, Enum):
    """Trust tier of a Source, per section VI (Source Policy).

    Tier 1 ("Official"): the artist/organization's own official channel.
    Tier 2 ("Editorial"): Vietnamese hip-hop trade press, labels, festival
            organizers.
    Tier 3 ("Community"): general streaming-platform release feeds (not
            an official channel, but still a verifiable platform, not a
            random blog).
    UNKNOWN ("Unknown"): Phase 2 addition — a Source the Normalizer could
            not confidently place in Tier 1/2/3. Scored very low by the
            Confidence Engine (config/confidence_weights.yaml), never
            silently dropped to 0 and never rejected outright: an editor
            reviewing the queue should be able to see "this came from
            somewhere unverified" rather than the event vanishing.
    """

    TIER_1 = "tier_1"
    TIER_2 = "tier_2"
    TIER_3 = "tier_3"
    UNKNOWN = "unknown"


# Human-readable labels for the tiers above, matching the vocabulary used
# in Phase 2's spec (section V) and in generated Prompts/Markdown.
# Display-only — never used for scoring logic (that stays entirely
# data-driven from config/confidence_weights.yaml).
SOURCE_TIER_LABELS = {
    SourceTier.TIER_1: "Official",
    SourceTier.TIER_2: "Editorial",
    SourceTier.TIER_3: "Community",
    SourceTier.UNKNOWN: "Unknown",
}
