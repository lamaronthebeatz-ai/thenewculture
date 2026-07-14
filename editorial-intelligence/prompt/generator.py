"""Prompt Generator (Phase 1 section X, extended by Phase 2 section VIII
and Phase 3 section 9) — the most important module here.

It does NOT write articles. It does NOT call any AI/LLM API (section
XVI: "KHÔNG gọi ChatGPT. KHÔNG gọi Claude API."). It produces one
complete, plain-text Prompt an editor copies into an external tool by
hand. Every section required by the spec is included:

  Editorial Guideline, Event, Sources, Metadata, SEO Requirement,
  Frontmatter, Suggested Series, Suggested Tags, Internal Linking
  Suggestions, Related Profiles, Markdown Rules (added Phase 2),
  Story Type, Priority, Editorial Notes, Suggested Links (added Phase 3,
  generate_for_story() only — see below).

Refuses to run on a low-confidence Event (section VII: "Nếu Confidence
thấp. Không đề xuất Prompt.") — this is enforced here, not left to the
caller to remember.
"""
import dataclasses
import datetime
import os
from typing import Optional

from ..events.confidence import ConfidenceEngine
from ..models.enums import EventStatus
from ..models.event import EditorialEvent
from ..models.prompt import EditorialPrompt
from ..models.recommendation import Recommendations
from ..models.story_candidate import StoryCandidate
from .frontmatter import ARTICLE_FRONTMATTER_FIELDS, build_frontmatter

_GUIDELINE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "editorial-guideline.md"
)


class LowConfidenceError(Exception):
    """Raised when generate() is asked to build a Prompt for an Event
    below the Confidence Engine's threshold. The caller (an editor-facing
    tool in a later phase) is expected to show this as "gather more
    sources first", not silently produce a lower-quality Prompt."""


def _load_guideline() -> str:
    with open(_GUIDELINE_PATH, encoding="utf-8") as f:
        return f.read()


def _format_sources(event: EditorialEvent) -> str:
    if not event.sources:
        return "(không có nguồn nào được ghi nhận)"
    lines = []
    for s in event.sources:
        url_part = f" — {s.url}" if s.url else ""
        lines.append(f"- [{s.tier.value}] {s.name}{url_part}")
    return "\n".join(lines)


def _format_frontmatter(event: EditorialEvent) -> str:
    fm = build_frontmatter(event)
    lines = [f"{key}: {fm[key]!r}" for key in ARTICLE_FRONTMATTER_FIELDS]
    return "\n".join(lines)


def _format_list(items, empty_note: str) -> str:
    items = list(items or [])
    if not items:
        return empty_note
    return "\n".join(f"- {item}" for item in items)


# Phase 2 (section VIII): "Markdown Rules" — the exact body-formatting
# conventions the CMS's own markdown widget already documents (see the
# "Nội dung bài viết" field's hint in admin/config.yml) so a draft
# written from this Prompt renders correctly once pasted into the CMS,
# without inventing a different set of rules here.
_MARKDOWN_RULES = (
    "- `##` tạo tiêu đề phụ (h2).\n"
    "- `>` tạo trích dẫn (blockquote).\n"
    "- Danh sách bắt đầu bằng `1.` (có số thứ tự) hoặc `-` (không số thứ tự).\n"
    "- Dán link YouTube, Spotify hoặc SoundCloud đứng riêng một dòng để tự động nhúng trình phát.\n"
    "- Không dùng HTML thô — chỉ dùng đúng các quy tắc markdown ở trên."
)


class PromptGenerator:
    def __init__(self, confidence_engine: Optional[ConfidenceEngine] = None, guideline_text: Optional[str] = None):
        self._confidence = confidence_engine or ConfidenceEngine()
        self._guideline_text = guideline_text if guideline_text is not None else _load_guideline()

    def generate(self, event: EditorialEvent) -> EditorialPrompt:
        if not self._confidence.is_prompt_eligible(event):
            raise LowConfidenceError(
                f"Event '{event.title}' (id={event.id}) has confidence "
                f"{event.confidence}, below threshold {self._confidence.threshold()} "
                f"— gather more Sources before generating a Prompt."
            )

        frontmatter = build_frontmatter(event)
        text = self._render(event, frontmatter)
        event.status = EventStatus.PROMPTED

        return EditorialPrompt(
            event_id=event.id,
            text=text,
            frontmatter=frontmatter,
            generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            sources=list(event.sources),
            related_artists=list(event.related_artists),
            related_profiles=list(event.related_profiles),
        )

    def generate_for_story(
        self,
        story: StoryCandidate,
        recommendations: Optional[Recommendations] = None,
    ) -> EditorialPrompt:
        """Phase 3, section 9. Reuses generate(story.event) for the
        entire Phase 1/2 Prompt (same eligibility gate, same rendering —
        generate() itself is completely untouched, so every existing
        caller/test keeps working exactly as before) and appends four
        new sections on top: Story Type, Priority, Editorial Notes,
        Suggested Links.

        `recommendations` (editorial/recommendation.py's output) is
        optional — if not supplied, Suggested Links falls back to
        `story.assignment.suggested_internal_links` (Assignment
        Generator's own output, section 4) if an Assignment was already
        generated, otherwise an empty list. Either way this method never
        computes recommendations itself — Phase 3's own engines own that
        logic, this only renders what it's given."""
        base = self.generate(story.event)

        if recommendations is not None:
            suggested_links = list(recommendations.internal_links)
        elif story.assignment is not None:
            suggested_links = list(story.assignment.suggested_internal_links)
        else:
            suggested_links = []

        extra_sections = f"""
## Story Type
{story.story_type.value}

## Priority
{story.priority_score}

## Editorial Notes
{_format_list(story.editorial_notes, "(không có ghi chú)")}

## Suggested Links
{_format_list(suggested_links, "(không có gợi ý liên kết)")}
"""
        return dataclasses.replace(
            base,
            text=base.text + extra_sections,
            story_type=story.story_type.value,
            priority_score=story.priority_score,
            editorial_notes=list(story.editorial_notes),
            suggested_links=suggested_links,
        )

    def _render(self, event: EditorialEvent, frontmatter: dict) -> str:
        return f"""# TNC Editorial Prompt

## Editorial Guideline
{self._guideline_text}

## Event
- Title: {event.title}
- Artist: {event.artist}
- Event Type: {event.event_type.value}
- Description: {event.description}
- Published At: {event.published_at or "(chưa xác định)"}

## Sources
{_format_sources(event)}

## Metadata
- Confidence: {event.confidence} (threshold: {self._confidence.threshold()})
- Language: {event.language}
- Country: {event.country}
- Platform: {event.platform or "(không rõ)"}
- Image: {event.image or "(không có)"}
- Status: {event.status.value}

## SEO Requirement
- Primary keyword suggestion: "{event.artist} {event.title}"
- Xem mục SEO trong Editorial Guideline phía trên — 1 keyword chính, dùng tự nhiên trong headline và đoạn mở đầu, không nhồi nhét.

## Frontmatter
{_format_frontmatter(event)}

## Suggested Series
{event.suggested_series or "(chưa xác định — xem Editorial Mapping)"}

## Suggested Tags
{_format_list(event.suggested_tags, "(không có gợi ý)")}

## Internal Linking Suggestions
{_format_list(event.related_artists, "(không có nghệ sĩ liên quan được ghi nhận)")}

## Related Profiles
{_format_list(event.related_profiles, "(không có hồ sơ liên quan được ghi nhận)")}

## Markdown Rules
{_MARKDOWN_RULES}
"""
