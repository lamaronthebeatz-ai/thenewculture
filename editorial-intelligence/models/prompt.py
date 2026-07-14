"""EditorialPrompt — the output of prompt/generator.py.

This is the ONLY artifact this system produces for human consumption. It
is plain text meant to be copied into an external tool (ChatGPT or
similar) by an editor — this module never calls that tool itself
(section X, section XVI)."""
from dataclasses import dataclass, field
from typing import Dict


@dataclass(frozen=True)
class EditorialPrompt:
    event_id: str
    text: str
    frontmatter: Dict[str, object] = field(default_factory=dict)
    generated_at: str = ""
