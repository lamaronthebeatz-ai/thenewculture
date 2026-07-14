"""Section IX: MarkdownGenerator — Input EditorialPrompt, Output draft.md
content matching the real CMS Articles frontmatter format."""
import yaml

from editorial_intelligence.events.confidence import ConfidenceEngine
from editorial_intelligence.models.enums import EventType, SourceTier
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.source import Source
from editorial_intelligence.prompt.frontmatter import ARTICLE_FRONTMATTER_FIELDS
from editorial_intelligence.prompt.generator import PromptGenerator
from editorial_intelligence.prompt.markdown_generator import MarkdownGenerator


def _high_confidence_prompt():
    event = EditorialEvent.create(
        title="Album X ra mắt", artist="Nghệ Sĩ A", event_type=EventType.ALBUM_RELEASE,
        description="mô tả", published_at="2026-08-20",
    )
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1, url="https://example.com/x"))
    event.related_artists = ["Nghệ Sĩ D"]
    event.related_profiles = ["nghe-si-d"]
    ConfidenceEngine().apply(event)
    from editorial_intelligence.events.mapping import EditorialMappingEngine
    EditorialMappingEngine().apply(event)
    return PromptGenerator().generate(event)


def test_generate_returns_valid_frontmatter_yaml():
    prompt = _high_confidence_prompt()
    draft = MarkdownGenerator().generate(prompt)

    assert draft.startswith("---\n")
    fm_block = draft.split("---\n", 2)[1]
    parsed = yaml.safe_load(fm_block)

    for key in ARTICLE_FRONTMATTER_FIELDS:
        assert key in parsed
    assert parsed["title"] == "Album X ra mắt"
    assert parsed["series"] == "tnc-records"


def test_generate_includes_body_placeholder_sources_profiles_links():
    prompt = _high_confidence_prompt()
    draft = MarkdownGenerator().generate(prompt)

    assert "TODO" in draft
    assert "## Nguồn tham khảo (Sources)" in draft
    assert "Official Website" in draft
    assert "https://example.com/x" in draft
    assert "## Hồ sơ liên quan (Related Profiles)" in draft
    assert "nghe-si-d" in draft
    assert "## Liên kết nội bộ gợi ý (Internal Links)" in draft
    assert "Nghệ Sĩ D" in draft


def test_write_creates_file(tmp_path):
    prompt = _high_confidence_prompt()
    path = tmp_path / "draft.md"
    content = MarkdownGenerator().write(prompt, str(path))

    assert path.exists()
    assert path.read_text(encoding="utf-8") == content


def test_generate_handles_empty_sources_and_related_fields():
    event = EditorialEvent.create(
        title="t", artist="a", event_type=EventType.ALBUM_RELEASE, description="", published_at="2026-08-01",
    )
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    ConfidenceEngine().apply(event)
    prompt = PromptGenerator().generate(event)

    draft = MarkdownGenerator().generate(prompt)
    assert "không có" in draft  # the empty-state notes render, no crash
