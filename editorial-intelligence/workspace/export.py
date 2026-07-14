"""Export (Phase 5) — combines everything already known about an
Article (Frontmatter, Source list, Editorial metadata, Assignment,
History, and the Markdown draft on disk if one exists) into one export
document.

Pure text builder — never calls the network, never touches
content/public, and never regenerates the Markdown itself (that stays
prompt/markdown_generator.py's job, unchanged and unused here beyond
reading the file it already wrote).
"""
import os
from typing import Optional

from ..prompt.frontmatter import build_frontmatter
from .article import Article


def _format_sources(article: Article) -> str:
    sources = article.story.event.sources
    if not sources:
        return "(không có nguồn nào được ghi nhận)"
    lines = []
    for s in sources:
        url_part = f" — {s.url}" if s.url else ""
        lines.append(f"- [{s.tier.value}] {s.name}{url_part}")
    return "\n".join(lines)


def _format_assignment(article: Article) -> str:
    a = article.story.assignment
    if a is None:
        return "(chưa có Assignment)"
    lines = [
        f"- Suggested Series: {a.suggested_series or '(chưa xác định)'}",
        f"- Suggested Category: {a.suggested_category or '(chưa xác định)'}",
        f"- Suggested Tags: {', '.join(a.suggested_tags) or '(không có)'}",
        f"- Suggested Profiles: {', '.join(a.suggested_profiles) or '(không có)'}",
        f"- Suggested Internal Links: {', '.join(a.suggested_internal_links) or '(không có)'}",
        f"- Suggested Length: {a.suggested_length or '(chưa xác định)'}",
    ]
    return "\n".join(lines)


def _format_history(article: Article) -> str:
    if not article.history:
        return "(chưa có lịch sử)"
    lines = []
    for h in article.history:
        note_part = f" — {h.note}" if h.note else ""
        lines.append(f"- [{h.timestamp}] {h.label}{note_part}")
    return "\n".join(lines)


def _read_markdown(article: Article) -> str:
    if article.markdown_path and os.path.exists(article.markdown_path):
        with open(article.markdown_path, encoding="utf-8") as f:
            return f.read()
    return "(chưa có Markdown — chạy `editorial markdown` trước)"


class ExportEngine:
    def export(self, article: Article) -> str:
        frontmatter = build_frontmatter(article.story.event)
        frontmatter_lines = "\n".join(f"{k}: {v!r}" for k, v in frontmatter.items())

        return f"""# Export — {article.title}

## Editorial Metadata
- ID: {article.id}
- Status: {article.status.value}
- Assigned Editor: {article.assigned_editor or '(chưa gán)'}
- Series: {article.series or '(chưa xác định)'}
- Story Type: {article.story_type.value}
- Priority: {article.priority}
- Created: {article.created}
- Updated: {article.updated}
- Published: {article.published or '(chưa xuất bản)'}

## Frontmatter
{frontmatter_lines}

## Source List
{_format_sources(article)}

## Assignment
{_format_assignment(article)}

## History
{_format_history(article)}

## Markdown
{_read_markdown(article)}
"""

    def write(self, article: Article, path: str) -> str:
        content = self.export(article)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return content
