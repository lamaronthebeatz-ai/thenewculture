"""MarkdownGenerator (Phase 2, section IX).

Input: EditorialPrompt (prompt/generator.py's output). Output: `draft.md`
content — a string matching the CMS's real Articles frontmatter format
exactly (same field names/order as prompt/frontmatter.py's
ARTICLE_FRONTMATTER_FIELDS), plus a body placeholder, Sources, Related
Profiles and Internal Links, per section IX.

Pure function — does NOT write to disk on its own (no automation, per
the Phase 2 preamble); `write()` below is an explicit, separate action a
caller opts into.
"""
import yaml

from ..models.prompt import EditorialPrompt
from .frontmatter import ARTICLE_FRONTMATTER_FIELDS


def _format_sources_section(prompt: EditorialPrompt) -> str:
    if not prompt.sources:
        return "(không có nguồn nào được ghi nhận)"
    lines = []
    for s in prompt.sources:
        url_part = f" — {s.url}" if s.url else ""
        lines.append(f"- [{s.tier.value}] {s.name}{url_part}")
    return "\n".join(lines)


def _format_name_list(items, empty_note: str) -> str:
    items = list(items or [])
    if not items:
        return empty_note
    return "\n".join(f"- {item}" for item in items)


class MarkdownGenerator:
    def generate(self, prompt: EditorialPrompt) -> str:
        frontmatter_yaml = self._render_frontmatter(prompt.frontmatter)
        body = self._render_body(prompt)
        return f"---\n{frontmatter_yaml}---\n\n{body}\n"

    def write(self, prompt: EditorialPrompt, path: str) -> str:
        """Explicit, separate action: renders and writes `draft.md`-style
        content to `path`. Never called automatically by generate() or
        anything in the collector pipeline — a human/caller decides when
        an actual file should be written (section II/Phase 2 preamble:
        "Không thêm Automation")."""
        content = self.generate(prompt)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return content

    def _render_frontmatter(self, frontmatter: dict) -> str:
        """Reuses PyYAML's own serializer instead of hand-formatting
        strings — guarantees valid YAML for any value (a title with a
        colon or apostrophe, etc.) rather than a string-format that only
        "usually" works. sort_keys=False keeps the exact field order
        ARTICLE_FRONTMATTER_FIELDS (and admin/config.yml) use."""
        ordered = {key: frontmatter.get(key) for key in ARTICLE_FRONTMATTER_FIELDS}
        return yaml.safe_dump(ordered, allow_unicode=True, sort_keys=False, default_flow_style=False)

    def _render_body(self, prompt: EditorialPrompt) -> str:
        return f"""<!-- TODO: viết nội dung bài viết tại đây. Xem Prompt đầy đủ
     (Editorial Guideline, SEO Requirement, Markdown Rules) trước khi viết.
     Xoá toàn bộ khối "Nguồn tham khảo" / "Hồ sơ liên quan" / "Liên kết nội
     bộ gợi ý" bên dưới trước khi đăng — đây là ghi chú cho người viết,
     không phải nội dung xuất bản. -->

## Nguồn tham khảo (Sources)
{_format_sources_section(prompt)}

## Hồ sơ liên quan (Related Profiles)
{_format_name_list(prompt.related_profiles, "(không có hồ sơ liên quan được ghi nhận)")}

## Liên kết nội bộ gợi ý (Internal Links)
{_format_name_list(prompt.related_artists, "(không có nghệ sĩ liên quan được ghi nhận)")}"""
