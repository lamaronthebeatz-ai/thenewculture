"""Source — a single observed reference backing an Editorial Event."""
from dataclasses import dataclass
from typing import Optional

from .enums import SourceTier


@dataclass(frozen=True)
class Source:
    """One place a Provider found evidence for an Event.

    `name` must match an entry in config/sources.yaml (e.g. "Spotify
    Artist", "Official Website") — that file, not this class, is the
    single source of truth for which names exist and what tier they
    carry. This class only carries the per-event occurrence: which named
    source, which URL, seen when.
    """

    name: str
    tier: SourceTier
    url: Optional[str] = None
    platform: Optional[str] = None
    retrieved_at: Optional[str] = None  # ISO 8601 timestamp, set by the Provider

    def key(self) -> str:
        """Stable identity for duplicate-source collapsing (section VII:
        'Duplicate Sources +5' means the SAME named source counted twice,
        not two different sources)."""
        return f"{self.name}:{self.url or ''}"
