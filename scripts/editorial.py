#!/usr/bin/env python3
"""Editorial OS CLI (Phase 4) — the single entrypoint an editor runs from
a terminal to drive the whole Editorial OS.

Usage: python scripts/editorial.py <command> [args]
Commands: collect, queue, dashboard, prompt, markdown, issue, recommend, review

KHÔNG gọi AI. KHÔNG OpenAI/Claude API. KHÔNG RSS. KHÔNG Worker. KHÔNG
network. This script only ever calls the already-completed
Phase 1-3 architecture (NewsProvider, CollectorPipeline, EditorialDesk,
PromptGenerator, MarkdownGenerator, RecommendationEngine,
CoverStorySelector, IssuePlanner, DashboardEngine) — it does not modify
any of them, and does not touch scripts/build.py, admin/config.yml, or
anything under content/ or public/.

Because `editorial-intelligence` (a hyphen, not a legal Python
identifier) still can't be a normal importable package, this file uses
the exact same importlib bootstrap as tests/conftest.py — see
editorial-intelligence/README.md for the full rationale.

Persistence note: queue/in_memory.py's InMemoryEventQueue is still
memory-only, per the locked architecture — nothing about it changed.
But a CLI is invoked as a *new OS process* for every command
(`collect` today, `queue` a minute later), so something has to survive
between those separate processes for the CLI to be usable at all. That
"something" is a small JSON state file this script manages entirely on
its own (.cli-state/stories.json, gitignored) — CollectorPipeline and
EditorialDesk never see it; they still run exactly as before, fully
in-memory, for the single `collect` invocation. Every other command
just reads back what `collect` last wrote.
"""
import argparse
import dataclasses
import importlib.util
import json
import os
import statistics
import sys
from enum import Enum

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EI_ROOT = os.path.join(REPO_ROOT, "editorial-intelligence")


def _load_editorial_intelligence():
    if "editorial_intelligence" in sys.modules:
        return sys.modules["editorial_intelligence"]
    spec = importlib.util.spec_from_file_location(
        "editorial_intelligence", os.path.join(EI_ROOT, "__init__.py"),
        submodule_search_locations=[EI_ROOT],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["editorial_intelligence"] = module
    spec.loader.exec_module(module)
    return module


_load_editorial_intelligence()

from editorial_intelligence.collector.pipeline import CollectorPipeline  # noqa: E402
from editorial_intelligence.editorial.cover_story import CoverStorySelector  # noqa: E402
from editorial_intelligence.editorial.dashboard import DashboardEngine  # noqa: E402
from editorial_intelligence.editorial.desk import EditorialDesk  # noqa: E402
from editorial_intelligence.editorial.issue_planner import IssuePlanner  # noqa: E402
from editorial_intelligence.editorial.recommendation import RecommendationEngine  # noqa: E402
from editorial_intelligence.models.enums import (  # noqa: E402
    EditorialDecisionType, EventStatus, EventType, SourceTier, StoryType,
)
from editorial_intelligence.models.event import EditorialEvent  # noqa: E402
from editorial_intelligence.models.mapping_result import MappingResult  # noqa: E402
from editorial_intelligence.models.source import Source  # noqa: E402
from editorial_intelligence.models.story_candidate import EditorialAssignment, StoryCandidate  # noqa: E402
from editorial_intelligence.prompt.generator import LowConfidenceError, PromptGenerator  # noqa: E402
from editorial_intelligence.prompt.markdown_generator import MarkdownGenerator  # noqa: E402
from editorial_intelligence.providers.news_provider import NewsProvider  # noqa: E402
from editorial_intelligence.providers.registry import ProviderRegistry  # noqa: E402
from editorial_intelligence.queue.in_memory import InMemoryEventQueue  # noqa: E402

DEFAULT_FIXTURES_DIR = os.path.join(EI_ROOT, "tests", "fixtures", "news")
STATE_DIR = os.path.join(EI_ROOT, ".cli-state")
STATE_FILE = os.path.join(STATE_DIR, "stories.json")

COLLECT_STEPS = [
    "Collect", "Normalize", "Validate", "Duplicate", "Confidence", "Mapping",
    "Story", "Priority", "Decision", "Assignment",
]


# --------------------------------------------------------------------
# CLI-only persistence (see module docstring). NOT part of the locked
# architecture — queue/in_memory.py is untouched and still memory-only
# for the single collect() run; this only lets separate CLI invocations
# see the same StoryCandidates afterwards.
# --------------------------------------------------------------------

def _stringify_enums(obj):
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, dict):
        return {k: _stringify_enums(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_stringify_enums(v) for v in obj]
    return obj


def _story_to_dict(story: StoryCandidate) -> dict:
    return _stringify_enums(dataclasses.asdict(story))


def _source_from_dict(d):
    return Source(
        name=d["name"], tier=SourceTier(d["tier"]), url=d.get("url"),
        platform=d.get("platform"), retrieved_at=d.get("retrieved_at"),
    )


def _event_from_dict(d) -> EditorialEvent:
    return EditorialEvent(
        id=d["id"], title=d["title"], artist=d["artist"],
        event_type=EventType(d["event_type"]), description=d["description"],
        published_at=d.get("published_at"),
        sources=[_source_from_dict(s) for s in d.get("sources", [])],
        confidence=d.get("confidence", 0),
        language=d.get("language", "vi"), country=d.get("country", "VN"),
        platform=d.get("platform"), image=d.get("image"),
        status=EventStatus(d.get("status", "discovered")),
        related_artists=list(d.get("related_artists", [])),
        related_profiles=list(d.get("related_profiles", [])),
        suggested_series=d.get("suggested_series"),
        suggested_tags=list(d.get("suggested_tags", [])),
        primary_source=_source_from_dict(d["primary_source"]) if d.get("primary_source") else None,
        mapping_result=MappingResult(**d["mapping_result"]) if d.get("mapping_result") else None,
    )


def _story_from_dict(d) -> StoryCandidate:
    story = StoryCandidate(event=_event_from_dict(d["event"]), story_type=StoryType(d["story_type"]))
    story.priority_score = d.get("priority_score", 0)
    story.decision = EditorialDecisionType(d["decision"]) if d.get("decision") else None
    story.decision_reason = d.get("decision_reason", "")
    story.assignment = EditorialAssignment(**d["assignment"]) if d.get("assignment") else None
    story.editorial_notes = list(d.get("editorial_notes", []))
    return story


def save_stories(stories):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump([_story_to_dict(s) for s in stories], f, ensure_ascii=False, indent=2)


def load_stories():
    if not os.path.exists(STATE_FILE):
        return []
    with open(STATE_FILE, encoding="utf-8") as f:
        raw = json.load(f)
    return [_story_from_dict(d) for d in raw]


def find_story(stories, event_id):
    for s in stories:
        if s.event.id == event_id:
            return s
    matches = [s for s in stories if s.event.id.startswith(event_id)]
    if len(matches) == 1:
        return matches[0]
    return None


def series_counts(stories):
    counts = {}
    for s in stories:
        if s.decision == EditorialDecisionType.PUBLISH and s.event.suggested_series:
            counts[s.event.suggested_series] = counts.get(s.event.suggested_series, 0) + 1
    return counts


# --------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------

def cmd_collect(args):
    fixtures_dir = args.fixtures or DEFAULT_FIXTURES_DIR
    provider = NewsProvider(fixtures_dir)
    registry = ProviderRegistry()
    registry.register(provider)
    queue = InMemoryEventQueue()
    pipeline = CollectorPipeline(registry, queue)  # unchanged Phase 1/2 class, called as-is

    new_events = pipeline.run()
    stories = EditorialDesk().process_all(queue.all())  # unchanged Phase 3 class, called as-is
    save_stories(stories)

    print("=== editorial collect ===")
    for step in COLLECT_STEPS:
        print(f"  [OK] {step}")
    print()
    print(f"Fixtures dir     : {fixtures_dir}")
    print(f"New events       : {len(new_events)}")
    print(f"Total in queue   : {queue.count()}")
    print(f"Total stories    : {len(stories)}")
    print(f"State saved to   : {STATE_FILE}")
    return 0


def cmd_queue(args):
    stories = load_stories()
    if not stories:
        print("Queue rỗng — chạy `editorial collect` trước.")
        return 0

    groups = [
        ("Pending Review", [s for s in stories if s.event.status == EventStatus.PENDING_REVIEW]),
        ("Hold", [s for s in stories if s.decision == EditorialDecisionType.HOLD]),
        ("Rejected", [s for s in stories if s.decision == EditorialDecisionType.REJECT]),
        ("Need More Sources", [s for s in stories if s.decision == EditorialDecisionType.NEED_MORE_SOURCES]),
        ("Publish Ready", [s for s in stories if s.decision == EditorialDecisionType.PUBLISH]),
    ]
    for label, items in groups:
        print(f"=== {label} ({len(items)}) ===")
        for s in items:
            print(f"  {s.event.id[:8]}  [{s.priority_score:>3}]  {s.event.title} — {s.event.artist}")
        print()
    return 0


def cmd_dashboard(args):
    stories = load_stories()
    if not stories:
        print("Queue rỗng — chạy `editorial collect` trước.")
        return 0

    stats = DashboardEngine().compute(stories)  # reused, not reimplemented
    confidences = [s.event.confidence for s in stories]
    priorities = [s.priority_score for s in stories]
    top_story = max(stories, key=lambda s: s.priority_score)
    cover_candidates = CoverStorySelector().candidates(stories, limit=1)  # reused

    series_dist = {}
    story_type_dist = {}
    for s in stories:
        key = s.event.suggested_series or "(chưa xác định)"
        series_dist[key] = series_dist.get(key, 0) + 1
        story_type_dist[s.story_type.value] = story_type_dist.get(s.story_type.value, 0) + 1

    print("=== editorial dashboard ===")
    print(f"Total Events      : {len(stories)}")
    print(f"Pending           : {stats.pending}")
    print(f"Ready             : {stats.published}")
    print(f"Rejected          : {stats.rejected}")
    print(f"Average Confidence: {statistics.mean(confidences):.1f}")
    print(f"Average Priority  : {statistics.mean(priorities):.1f}")
    print(f"Top Story         : {top_story.event.title} (priority={top_story.priority_score})")
    if cover_candidates:
        print(f"Cover Candidate   : {cover_candidates[0].event.title}")
    else:
        print("Cover Candidate   : (không có ứng viên)")
    print()
    print("Series Distribution:")
    for series, count in sorted(series_dist.items()):
        print(f"  {series:<20} {count}")
    print()
    print("Story Distribution:")
    for story_type, count in sorted(story_type_dist.items()):
        print(f"  {story_type:<12} {count}")
    return 0


def cmd_prompt(args):
    stories = load_stories()
    story = find_story(stories, args.event_id)
    if story is None:
        print(f"Không tìm thấy story với id: {args.event_id}")
        return 1

    recommendations = RecommendationEngine().recommend(story, pool=stories)  # reused
    try:
        prompt = PromptGenerator().generate_for_story(story, recommendations=recommendations)  # reused, unchanged
    except LowConfidenceError as e:
        print(f"Không thể sinh Prompt: {e}")
        return 1

    print(prompt.text)
    save_stories(stories)  # persist event.status -> PROMPTED
    return 0


def cmd_markdown(args):
    stories = load_stories()
    story = find_story(stories, args.event_id)
    if story is None:
        print(f"Không tìm thấy story với id: {args.event_id}")
        return 1

    recommendations = RecommendationEngine().recommend(story, pool=stories)
    try:
        prompt = PromptGenerator().generate_for_story(story, recommendations=recommendations)
    except LowConfidenceError as e:
        print(f"Không thể sinh Markdown: {e}")
        return 1

    output_path = args.output or f"draft-{story.event.id[:8]}.md"
    MarkdownGenerator().write(prompt, output_path)  # reused, unchanged
    print(f"Đã sinh: {output_path}")
    save_stories(stories)
    return 0


def cmd_recommend(args):
    stories = load_stories()
    story = find_story(stories, args.event_id)
    if story is None:
        print(f"Không tìm thấy story với id: {args.event_id}")
        return 1

    recs = RecommendationEngine().recommend(story, pool=stories)  # reused, single source of truth

    # Related Releases / Related Timeline / Related Events are display-only
    # groupings computed here from the already-loaded pool — no new engine
    # logic, no change to RecommendationEngine/EditorialDesk.
    release_types = {"album_release", "single_release", "mv_release"}
    related_releases = [
        s.event.title for s in stories
        if s is not story and s.event.artist == story.event.artist
        and s.event.event_type.value in release_types
    ]
    related_timeline = [
        s.event.title for s in stories
        if s is not story and s.event.artist == story.event.artist
        and s.story_type == StoryType.TIMELINE
    ]
    related_events = [
        s.event.title for s in stories
        if s is not story and s.event.artist == story.event.artist
    ]

    def _print_section(title, items):
        print(f"=== {title} ===")
        if not items:
            print("  (không có)")
        for item in items:
            print(f"  - {item}")
        print()

    _print_section("Related Articles", recs.related_articles)
    _print_section("Related Artists", recs.internal_links)
    _print_section("Related Releases", related_releases)
    _print_section("Related Timeline", related_timeline)
    _print_section("Related Events", related_events)
    return 0


def cmd_issue(args):
    stories = load_stories()
    if not stories:
        print("Queue rỗng — chạy `editorial collect` trước.")
        return 0

    planner = IssuePlanner()  # reused
    counts = series_counts(stories)
    balance = planner.series_balance_report(counts)
    suggestions = planner.suggest_for_issue(stories, counts)
    cover_candidates = CoverStorySelector().candidates(stories, limit=3)  # reused

    story_type_dist = {}
    for s in stories:
        story_type_dist[s.story_type.value] = story_type_dist.get(s.story_type.value, 0) + 1

    print("=== Issue Balance ===")
    for series, info in sorted(balance.items()):
        print(f"  {series:<20} target={info['target']} current={info['current']} gap={info['gap']}")
    print()

    print("=== Series ===")
    for series, count in sorted(counts.items()):
        print(f"  {series:<20} {count}")
    print()

    print("=== Story Types ===")
    for story_type, count in sorted(story_type_dist.items()):
        print(f"  {story_type:<12} {count}")
    print()

    print("=== Priority (đề xuất cho issue hiện tại) ===")
    for s in suggestions[:10]:
        print(f"  [{s.priority_score:>3}] {s.event.title} ({s.event.suggested_series})")
    print()

    print("=== Cover Candidate ===")
    if cover_candidates:
        for c in cover_candidates:
            print(f"  {c.event.title} (priority={c.priority_score})")
    else:
        print("  (không có ứng viên)")
    print()

    print("=== Missing Categories ===")
    missing = {series: info for series, info in balance.items() if info["gap"] > 0}
    if not missing:
        print("  (không thiếu series nào)")
    for series, info in sorted(missing.items()):
        print(f"  {series} (thiếu {info['gap']})")
    return 0


def cmd_review(args):
    stories = load_stories()
    if not stories:
        print("Queue rỗng — chạy `editorial collect` trước.")
        return 0

    groups = [
        ("Publish", EditorialDecisionType.PUBLISH),
        ("Hold", EditorialDecisionType.HOLD),
        ("Reject", EditorialDecisionType.REJECT),
        ("NeedMoreSources", EditorialDecisionType.NEED_MORE_SOURCES),
    ]
    for label, decision in groups:
        items = [s for s in stories if s.decision == decision]
        print(f"=== {label} ({len(items)}) ===")
        for s in items:
            print(
                f"  {s.event.id[:8]}  [{s.priority_score:>3}]  {s.event.title} — "
                f"{s.event.artist} ({s.story_type.value}) — {s.decision_reason}"
            )
        print()
    return 0


# --------------------------------------------------------------------
# argparse wiring
# --------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(prog="editorial", description="Editorial OS CLI (Phase 4)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p = subparsers.add_parser("collect", help="NewsProvider -> CollectorPipeline -> EditorialDesk -> EventQueue")
    p.add_argument("--fixtures", default=None, help="Thư mục fixture JSON (mặc định: tests/fixtures/news)")
    p.set_defaults(func=cmd_collect)

    p = subparsers.add_parser("queue", help="Pending Review / Hold / Rejected / Need More Sources / Publish Ready")
    p.set_defaults(func=cmd_queue)

    p = subparsers.add_parser("dashboard", help="Thống kê tổng quan")
    p.set_defaults(func=cmd_dashboard)

    p = subparsers.add_parser("prompt", help="In toàn bộ Prompt cho 1 event (KHÔNG gọi AI)")
    p.add_argument("event_id")
    p.set_defaults(func=cmd_prompt)

    p = subparsers.add_parser("markdown", help="Sinh draft.md cho 1 event")
    p.add_argument("event_id")
    p.add_argument("--output", "-o", default=None, help="Đường dẫn file .md xuất ra")
    p.set_defaults(func=cmd_markdown)

    p = subparsers.add_parser("issue", help="Báo cáo Issue Balance/Series/Story Types/Priority/Cover/Missing")
    p.set_defaults(func=cmd_issue)

    p = subparsers.add_parser("recommend", help="Related Articles/Artists/Releases/Timeline/Events cho 1 event")
    p.add_argument("event_id")
    p.set_defaults(func=cmd_recommend)

    p = subparsers.add_parser("review", help="Toàn bộ bài theo Publish/Hold/Reject/NeedMoreSources")
    p.set_defaults(func=cmd_review)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
