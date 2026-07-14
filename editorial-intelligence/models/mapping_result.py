"""MappingResult — the full output of EditorialMappingEngine.apply_full()
(events/mapping.py), Phase 2 (section VI). Kept as its own model instead
of a plain dict so the shape is explicit and typed; it does not replace
or change `EditorialEvent.suggested_series` / `suggested_tags` (Phase 1,
untouched) — those two stay the "quick" fields, this is the full
9-field editorial-routing decision."""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class MappingResult:
    category: str
    series: Optional[str]
    profiles: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    homepage: bool = False
    magazine: bool = False
    related_profiles: List[str] = field(default_factory=list)
    related_series: List[str] = field(default_factory=list)
    search_weight: int = 0
