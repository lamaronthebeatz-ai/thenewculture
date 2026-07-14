"""Phase 3 section 9: PromptGenerator.generate_for_story()."""
from editorial_intelligence.editorial.assignment import AssignmentGenerator
from editorial_intelligence.events.confidence import ConfidenceEngine
from editorial_intelligence.models.enums import EventType, SourceTier, StoryType
from editorial_intelligence.models.event import EditorialEvent
from editorial_intelligence.models.mapping_result import MappingResult
from editorial_intelligence.models.recommendation import Recommendations
from editorial_intelligence.models.source import Source
from editorial_intelligence.models.story_candidate import StoryCandidate
from editorial_intelligence.prompt.generator import PromptGenerator


def _high_confidence_story(story_type=StoryType.RELEASE):
    event = EditorialEvent.create(
        title="Album X ra mắt", artist="Nghệ Sĩ A", event_type=EventType.ALBUM_RELEASE,
        description="mô tả", published_at="2026-08-20",
    )
    event.add_source(Source(name="Official Website", tier=SourceTier.TIER_1))
    ConfidenceEngine().apply(event)
    event.suggested_series = "tnc-records"
    event.mapping_result = MappingResult(category="Release", series="tnc-records")
    story = StoryCandidate(event=event, story_type=story_type)
    story.priority_score = 85
    story.editorial_notes = ["Ưu tiên xuất bản trong tuần này."]
    return story


def test_generate_for_story_includes_phase1_and_phase3_sections():
    story = _high_confidence_story()
    prompt = PromptGenerator().generate_for_story(story)

    for heading in [
        "## Editorial Guideline", "## Event", "## Sources", "## Metadata",
        "## SEO Requirement", "## Frontmatter", "## Suggested Series",
        "## Suggested Tags", "## Internal Linking Suggestions", "## Related Profiles",
        "## Markdown Rules", "## Story Type", "## Priority", "## Editorial Notes", "## Suggested Links",
    ]:
        assert heading in prompt.text, f"missing section: {heading}"


def test_generate_for_story_populates_new_fields():
    story = _high_confidence_story(story_type=StoryType.BREAKING)
    prompt = PromptGenerator().generate_for_story(story)

    assert prompt.story_type == "breaking"
    assert prompt.priority_score == 85
    assert prompt.editorial_notes == ["Ưu tiên xuất bản trong tuần này."]
    assert "Ưu tiên xuất bản trong tuần này." in prompt.text
    assert "breaking" in prompt.text


def test_generate_for_story_uses_recommendations_when_provided():
    story = _high_confidence_story()
    recs = Recommendations(internal_links=["Nghệ Sĩ D", "Nghệ Sĩ E"])
    prompt = PromptGenerator().generate_for_story(story, recommendations=recs)
    assert prompt.suggested_links == ["Nghệ Sĩ D", "Nghệ Sĩ E"]
    assert "Nghệ Sĩ D" in prompt.text


def test_generate_for_story_falls_back_to_assignment_internal_links():
    story = _high_confidence_story()
    AssignmentGenerator().generate(story)  # populates story.assignment
    prompt = PromptGenerator().generate_for_story(story)
    assert prompt.suggested_links == story.assignment.suggested_internal_links


def test_generate_for_story_no_recommendations_no_assignment_gives_empty_links():
    story = _high_confidence_story()
    prompt = PromptGenerator().generate_for_story(story)
    assert prompt.suggested_links == []
    assert "không có gợi ý liên kết" in prompt.text


def test_generate_still_works_unchanged_phase1_entry_point():
    story = _high_confidence_story()
    prompt = PromptGenerator().generate(story.event)  # Phase 1 entry point, untouched
    assert prompt.story_type == ""  # default, never populated by generate()
    assert prompt.priority_score == 0
    assert "## Story Type" not in prompt.text  # Phase 3 sections only via generate_for_story()
