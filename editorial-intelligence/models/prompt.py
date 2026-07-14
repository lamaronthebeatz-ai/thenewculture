"""EditorialPrompt — the output of prompt/generator.py.

This is the ONLY artifact this system produces for human consumption. It
is plain text meant to be copied into an external tool (ChatGPT or
similar) by an editor — this module never calls that tool itself
(section X, section XVI)."""
from dataclasses import dataclass, field
from typing import Dict, List

from .source import Source


@dataclass(frozen=True)
class EditorialPrompt:
    event_id: str
    text: str
    frontmatter: Dict[str, object] = field(default_factory=dict)
    generated_at: str = ""

    # Phase 2 additions (additive only, same reasoning as
    # EditorialEvent.primary_source/mapping_result): structured data
    # MarkdownGenerator (prompt/markdown_generator.py, section IX) needs
    # as INPUT, so it never has to parse `text` back out of itself.
    sources: List[Source] = field(default_factory=list)
    related_artists: List[str] = field(default_factory=list)
    related_profiles: List[str] = field(default_factory=list)
