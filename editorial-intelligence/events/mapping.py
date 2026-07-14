"""Editorial Mapping (section IX).

Maps an EventType to a suggested Series slug and a small set of suggested
tags. This engine only ever *suggests* — it never writes to
admin/config.yml, never creates a Series, and the mapping table itself
is pure config data (config/editorial_mapping.yaml), not Python
conditionals, so extending it is a one-line data change (section IX:
"Có thể mở rộng").
"""
import re
import unicodedata
from typing import Dict, List, Optional

from ..config.loader import load_editorial_mapping
from ..models.event import EditorialEvent

# Matches the real tag style already used across content/articles/*.md,
# e.g. "#TNC", "#TNCOrigins", "#Gfamily" — no spaces, no punctuation.
_TAG_UNSAFE = re.compile(r"[^a-zA-Z0-9]+")


def _to_tag(text: str) -> str:
    """NFD-decompose before stripping non-ASCII, same technique
    `scripts/build.py`'s `slugify()` uses for Vietnamese text — dropping
    accents straight from the composed string (e.g. a plain regex over
    "Nghệ") deletes the accented letter entirely ("Ngh"), not just its
    diacritic. NFD splits the base letter from its combining mark first,
    so only the mark is dropped and "Nghệ" becomes "Nghe", not "Ngh"."""
    ascii_text = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("ascii")
    return "#" + _TAG_UNSAFE.sub("", ascii_text)


class EditorialMappingEngine:
    def __init__(self, mapping: Optional[Dict[str, str]] = None):
        self._mapping = mapping if mapping is not None else load_editorial_mapping()

    def suggest_series(self, event: EditorialEvent) -> Optional[str]:
        return self._mapping.get(event.event_type.value)

    def suggest_tags(self, event: EditorialEvent) -> List[str]:
        tags = ["#TNC"]
        if event.artist:
            tags.append(_to_tag(event.artist))
        series = self.suggest_series(event)
        if series:
            # "tnc-records" -> "TNCRecords" -> "#TNCRecords"
            tags.append(_to_tag(series.replace("-", " ").title()))
        # de-dupe, preserve order
        seen = []
        for t in tags:
            if t not in seen and t != "#":
                seen.append(t)
        return seen

    def apply(self, event: EditorialEvent) -> EditorialEvent:
        event.suggested_series = self.suggest_series(event)
        event.suggested_tags = self.suggest_tags(event)
        return event
