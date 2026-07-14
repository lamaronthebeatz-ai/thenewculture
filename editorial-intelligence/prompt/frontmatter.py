"""Builds a frontmatter dict matching the REAL Articles collection in
admin/config.yml — same field names, same shape a brand-new CMS entry
already has. Section XII is explicit: "KHÔNG tạo Collection mới. KHÔNG
sửa Collection Articles... Prompt Generator phải sinh đúng Frontmatter
hiện có." This module reads admin/config.yml's field list nowhere —
it hardcodes the field NAMES here deliberately, because those names are
the CMS's actual public contract with every existing article on the
site; if that collection's schema ever changes, this is the one place
meant to be updated to match, same as any other consumer of a stable
contract. (Section II's "Không hardcode" is about not hardcoding
*editorial judgement data* like source tiers or series mappings, which
live in config/ instead — a fixed external schema is a different thing.)

`body` is intentionally NOT included: it is the CMS's article content
field, which is exactly what the Prompt asks an external writing tool to
draft — Editorial Intelligence provides the brief, not a starting body.
"""
from typing import Dict, List

from ..models.event import EditorialEvent

# The Articles collection's field order, admin/config.yml (articles.fields),
# excluding `body`. Kept as an explicit tuple so frontmatter dicts this
# module builds always enumerate keys in the same order the CMS itself
# lists them, purely for readability in the generated Prompt.
ARTICLE_FRONTMATTER_FIELDS = (
    "title", "series", "dek", "cover", "cover_credit", "poster",
    "author", "date", "read_time", "featured", "order", "tags",
)


def build_frontmatter(event: EditorialEvent) -> Dict[str, object]:
    """Starting suggestions for a human writer/editor to revise — not a
    finished article. Only `title`, `series` and `tags` are seeded from
    actual Editorial Intelligence output (the event itself, and Editorial
    Mapping's suggestion); everything else is left in the same
    honestly-empty shape the CMS itself uses for a brand-new entry
    (see admin/config.yml defaults for `dek`, `cover_credit`, `date`,
    `read_time`, `featured`, `order`)."""
    tags: List[str] = list(event.suggested_tags) if event.suggested_tags else ["#TNC"]
    return {
        "title": event.title,
        "series": event.suggested_series or "",
        "dek": "",
        "cover": "",
        "cover_credit": "",
        "poster": "",
        "author": "",
        "date": "",
        "read_time": "",
        "featured": False,
        "order": 1,
        "tags": tags,
    }
