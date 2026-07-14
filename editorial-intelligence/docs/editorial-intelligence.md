# Editorial Intelligence v1.0 — Architecture

Status: Phase 3 complete (Phase 1 architecture, Phase 2 Collector/
Provider implementation, Phase 3 Editorial Intelligence layer — Story/
Priority/Decision/Assignment/Issue Planner/Cover Story/Recommendation/
Dashboard). See "Roadmap" for what is deliberately not built yet
(Phase 4 is a CLI only — still no API/Worker/RSS/AI).

## What this is, and isn't

Editorial Intelligence is infrastructure for the editorial desk, not an
autopilot. It never writes an article and never calls an AI/LLM API. Its
one output is a Prompt — a complete, plain-text brief an editor copies
into an external writing tool by hand.

It is a fully independent module. It does not import from, get imported
by, or read/write any file under `scripts/`, `admin/`, `content/`, or
`public/`. Nothing about the CMS, Homepage, Magazine, Profiles,
Discovery, Search or Promotion changed to build this — see "Regression"
in the PR description for how that was verified.

## Folder Tree

```
editorial-intelligence/
├── README.md                    # why there's no top-level __init__ import path
├── __init__.py                  # package marker + the sys.path/importlib note
├── models/                      # pure data — no logic, no I/O
│   ├── enums.py                 #   EventType, EventStatus, SourceTier, StoryType,
│   │                             #   EditorialDecisionType (Phase 3)
│   ├── source.py                #   Source
│   ├── event.py                 #   EditorialEvent (+ id generation; primary_source/
│   │                             #   mapping_result added Phase 2, both optional)
│   ├── prompt.py                #   EditorialPrompt (sources/related_* added Phase 2;
│   │                             #   story_type/priority_score/editorial_notes/
│   │                             #   suggested_links added Phase 3, all optional)
│   ├── mapping_result.py        #   MappingResult (Phase 2)
│   ├── story_candidate.py       #   StoryCandidate, EditorialAssignment (Phase 3)
│   ├── recommendation.py        #   Recommendations (Phase 3)
│   └── dashboard_stats.py       #   DashboardStats (Phase 3)
├── providers/                   # Provider Interface (section V)
│   ├── base.py                  #   EventProvider ABC: fetch/normalize/validate
│   ├── registry.py               #   ProviderRegistry
│   └── news_provider.py          #   NewsProvider — reads local JSON fixtures (Phase 2)
├── events/                      # operations ON EditorialEvent
│   ├── normalizer.py             #   clean_text/dedupe (Phase 1) + EventNormalizer (Phase 2)
│   ├── validation.py              #   validate_event() -> raises ValidationError (Phase 2)
│   ├── confidence.py             #   Confidence Engine (section VII)
│   ├── duplicate.py               #   Duplicate Engine (+ URL signal, primary_source — Phase 2)
│   └── mapping.py                #   Editorial Mapping (apply() Phase 1, apply_full() Phase 2)
├── queue/                       # EventQueue
│   ├── interface.py              #   EventQueue ABC (push/get/all/update_status, Phase 1;
│   │                             #   remove() + enqueue/dequeue/peek/list/count/clear, Phase 2)
│   └── in_memory.py              #   InMemoryEventQueue (only impl)
├── collector/                   # orchestration — Phase 1/2 EditorialEvent pipeline
│   └── pipeline.py                #   CollectorPipeline — wires providers/events/queue above
├── editorial/                   # Phase 3 — Editorial Intelligence layer, operates on
│   │                             #   StoryCandidate (built from already-processed events)
│   ├── story.py                   #   Story Layer: EditorialEvent -> StoryCandidate
│   ├── priority.py                #   Priority Engine (separate from Confidence Score)
│   ├── decision.py                #   Editorial Decision (Publish/Hold/Reject/Merge/NeedMoreSources)
│   ├── assignment.py               #   Assignment Generator
│   ├── recommendation.py           #   Recommendation Engine
│   ├── cover_story.py               #   Cover Story Candidate selector
│   ├── issue_planner.py             #   Issue Planner (series balance)
│   ├── dashboard.py                 #   Dashboard Data
│   └── desk.py                       #   EditorialDesk — Phase 3's own orchestrator
├── prompt/                      # Prompt Generator (section X) — no AI call
│   ├── frontmatter.py            #   builds the Articles-collection-shaped dict
│   ├── generator.py               #   generate() Phase 1/2; generate_for_story() Phase 3
│   └── markdown_generator.py       #   MarkdownGenerator -> draft.md (Phase 2)
├── config/                      # DATA, not code — the "no hardcode" seam
│   ├── sources.yaml               #   Source Registry / tiers (section VI)
│   ├── confidence_weights.yaml    #   scoring table (+ "unknown" tier, Phase 2)
│   ├── editorial_mapping.yaml     #   event_type -> series (section IX)
│   ├── event_categories.yaml      #   category/homepage/magazine/related_series/search_weight (Phase 2)
│   ├── story_classification.yaml  #   event_type -> StoryType + Breaking rule (Phase 3)
│   ├── priority_weights.yaml      #   Priority Engine weights (Phase 3)
│   ├── editorial_decision.yaml    #   Publish/Hold thresholds (Phase 3)
│   ├── assignment_rules.yaml      #   suggested length by StoryType (Phase 3)
│   ├── cover_story_rules.yaml     #   Cover Story eligibility (Phase 3)
│   ├── issue_balance.yaml         #   per-Series target distribution (Phase 3)
│   ├── dashboard_config.yaml      #   high_priority_threshold (Phase 3)
│   └── loader.py                  #   the only file that opens any of the above
├── docs/
│   ├── editorial-intelligence.md  # this file
│   └── editorial-guideline.md     # section XI — embedded into every Prompt
└── tests/                       # 164 tests, 97% coverage (pytest-cov)
    ├── conftest.py                # loads this dir as `editorial_intelligence`
    ├── fakes.py                   # FakeProvider test double — not a real Source
    ├── fixtures/news/*.json       # NewsProvider fixtures (Phase 2)
    └── test_*.py                  # one file per module above
```

## Why there's no bare top-level import

`editorial-intelligence` has a hyphen — not a legal Python identifier —
so `import editorial-intelligence` can never work, full stop. Worse: one
of its required subfolders is named `queue`, the same name as a Python
standard-library module. Adding this directory to `sys.path` and
importing siblings as bare top-level names (`import queue`) would make
our `queue/` collide with the real one for *every* `import queue`
anywhere else in the same process.

The fix used throughout this module: load `editorial-intelligence/` once,
via `importlib.util.spec_from_file_location`, under the valid alias
`editorial_intelligence` (see `tests/conftest.py` for the actual code).
Every file inside then uses ordinary **relative** imports
(`from ..models.event import EditorialEvent`), so the standard-library
`queue` is never shadowed and every import inside this package resolves
the same way a normally-installed package's would.

### Running it

Test suite: `pytest editorial-intelligence/tests` from the repo root
(needs `pip install pytest pyyaml`; `pyyaml` is already what
`scripts/build.py` uses, no new project dependency).

A standalone script does the same one-time load:

```python
import importlib.util, os, sys

ROOT = "/path/to/repo/editorial-intelligence"
spec = importlib.util.spec_from_file_location(
    "editorial_intelligence", os.path.join(ROOT, "__init__.py"),
    submodule_search_locations=[ROOT],
)
module = importlib.util.module_from_spec(spec)
sys.modules["editorial_intelligence"] = module
spec.loader.exec_module(module)

from editorial_intelligence.models.enums import EventType
```

## Module Diagram

```
                         ┌─────────────────────┐
                         │   ProviderRegistry   │
                         │ (providers/registry) │
                         └──────────┬───────────┘
                                    │ .all()
                                    ▼
┌──────────────┐   fetch()   ┌─────────────┐  normalize()+validate()
│ EventProvider │◄───────────│  (Phase 1.1 │────────────────┐
│  (interface)  │            │  concrete   │                │
└──────────────┘             │  providers) │                ▼
                              └─────────────┘        EditorialEvent
                                                             │
                                                             ▼
                                                 ┌───────────────────────┐
                                                 │   CollectorPipeline    │
                                                 │   (collector/pipeline) │
                                                 └───────────┬───────────┘
                              ┌──────────────────────────────┼──────────────────────────────┐
                              ▼                               ▼                               ▼
                    ┌──────────────────┐           ┌────────────────────┐          ┌─────────────────────┐
                    │  DuplicateEngine  │           │  ConfidenceEngine   │          │ EditorialMappingEngine│
                    │ (events/duplicate)│           │ (events/confidence) │          │  (events/mapping)     │
                    └──────────────────┘           └──────────┬─────────┘          └─────────────────────┘
                                                                │ reads
                                                                ▼
                                                    config/confidence_weights.yaml
                                                    config/sources.yaml
                                                    config/editorial_mapping.yaml
                                                                │
                                                                ▼
                                                      ┌───────────────────┐
                                                      │    EventQueue      │
                                                      │ (queue/in_memory)  │
                                                      └─────────┬─────────┘
                                                                │ editor requests a Prompt
                                                                ▼
                                                     ┌────────────────────┐
                                                     │   PromptGenerator   │
                                                     │  (prompt/generator) │
                                                     └─────────┬──────────┘
                                                                │ reads
                                                                ▼
                                                docs/editorial-guideline.md
                                                                │
                                                                ▼
                                                       EditorialPrompt (text)
                                                    → editor copies to ChatGPT/etc.
```

## Event Flow

1. A `ProviderRegistry` holds zero or more `EventProvider` instances
   (Phase 1 ships none — see Roadmap).
2. `CollectorPipeline.run()` calls `provider.collect()` for every
   registered provider. `collect()` is a template method
   (`providers/base.py`) that internally calls `fetch()` →
   `normalize()` → `validate()`, so nothing outside a Provider ever sees
   a raw payload — only fully-formed `EditorialEvent`s come out.
3. For each Event: `DuplicateEngine.process()` checks it against every
   Event already in the `EventQueue` (Artist + Event Type mandatory,
   plus 2-of-3 on Release Date/Title/Platform — see `events/duplicate.py`
   docstring). If a match is found, the new Event's Sources/related
   fields are merged into the existing one and the new one is marked
   `EventStatus.MERGED`.
4. `ConfidenceEngine.apply()` scores the (possibly just-merged) Event
   from its Sources, using `config/confidence_weights.yaml`. Below
   `prompt_eligibility_threshold`, status becomes `LOW_CONFIDENCE`;
   otherwise `PENDING_REVIEW`.
5. `EditorialMappingEngine.apply()` sets `suggested_series` and
   `suggested_tags` from `config/editorial_mapping.yaml`.
6. The Event is pushed into the `EventQueue` (in-memory, Phase 1).

## Prompt Flow

1. An editor picks a `PENDING_REVIEW` Event from the queue
   (`EventQueue.list_pending_review()`).
2. `PromptGenerator.generate(event)` first checks
   `ConfidenceEngine.is_prompt_eligible(event)` — refuses with
   `LowConfidenceError` if the Event never reached the threshold (this
   can't be bypassed by calling generate() directly; the check lives
   inside `generate()` itself).
3. It loads `docs/editorial-guideline.md` verbatim and assembles one
   Prompt text with, in order: Editorial Guideline, Event, Sources,
   Metadata, SEO Requirement, Frontmatter (via `prompt/frontmatter.py`,
   matching the real Articles collection's field names exactly),
   Suggested Series, Suggested Tags, Internal Linking Suggestions,
   Related Profiles.
4. The Event's status is set to `PROMPTED`.
5. The returned `EditorialPrompt.text` is meant to be copied, by a human,
   into ChatGPT or an equivalent external tool. Nothing in this codebase
   calls that tool.

## Phase 3 Flow (Editorial Intelligence layer)

Runs strictly AFTER the Collector pipeline (`CollectorPipeline.run()`,
above) has already produced scored/deduped/mapped `EditorialEvent`s in
the `EventQueue`. `collector/pipeline.py` has zero lines changed for any
of this — `editorial/desk.py` is a separate orchestrator over
`StoryCandidate`, a new model that *wraps* an `EditorialEvent` rather
than adding fields to it.

1. `EditorialDesk.process(event)` / `.process_all(events)`:
   a. `StoryLayer.build(event)` — classifies a `StoryType` (event_type
      default map + a Breaking override rule, `config/
      story_classification.yaml`) and wraps the event in a
      `StoryCandidate`.
   b. `PriorityEngine.apply(story)` — Priority Score from `story_type`
      base weight + a Confidence-Score-weighted bonus + Homepage/
      Magazine bonuses (reusing Phase 2's `event.mapping_result`),
      entirely from `config/priority_weights.yaml`. This is a
      *different metric* from Confidence Score, never a re-labeling of
      it.
   c. `EditorialDecisionEngine.decide(story)` — first-match rule tree:
      `EventStatus.REJECTED/MERGED/LOW_CONFIDENCE` (already known facts
      from the Collector pipeline) always win; otherwise Priority Score
      vs. `config/editorial_decision.yaml`'s thresholds decides
      Publish/Hold/NeedMoreSources.
   d. `AssignmentGenerator.generate(story, pool)` — Series/Category/
      Tags/Profiles straight from `event.mapping_result` (reused, not
      recomputed); Suggested Length from `config/assignment_rules.yaml`
      keyed by `story_type`; Internal Links delegated to
      `RecommendationEngine` (constructor-injected).
2. Pool-level operations, called separately with the list `process_all()`
   returns — these need to see many `StoryCandidate`s at once, so they
   are not part of the per-story sequence above:
   - `RecommendationEngine.recommend(story, pool)` — Related Profiles/
     Series from `event.mapping_result`; Related Articles are *other
     StoryCandidates in the same pool* (never real site articles —
     Editorial Intelligence still has zero access to
     `content/articles/*.md`); Internal Links from
     `event.related_artists`.
   - `CoverStorySelector.candidates(stories)` — ranks PUBLISH-decision
     stories of an eligible `story_type` at/above a minimum Priority
     Score (`config/cover_story_rules.yaml`).
   - `IssuePlanner.suggest_for_issue(stories, current_counts)` /
     `.series_balance_report(current_counts)` — ranks PUBLISH stories by
     how under-represented their Series is against
     `config/issue_balance.yaml`'s target distribution, then by
     Priority Score. Has no access to `content/magazine/*.md` or
     `scripts/magazine.py` — `current_counts` is just a
     caller-supplied `Dict[str, int]`.
   - `DashboardEngine.compute(stories)` — Pending/High Priority/Low
     Confidence/Duplicate/Published/Rejected counts, purely from each
     `StoryCandidate`'s already-computed `decision`/`priority_score` and
     the underlying `event.status`.
3. `PromptGenerator.generate_for_story(story, recommendations=None)` —
   calls the untouched `generate(story.event)` first (same eligibility
   gate, same Phase 1/2 sections), then appends Story Type/Priority/
   Editorial Notes/Suggested Links. `generate()` itself never changed;
   every existing caller keeps working exactly as before.

## Extension Points

- **New Provider**: implement `EventProvider` (3 methods), register it
  with a `ProviderRegistry`. No change to `CollectorPipeline`,
  `DuplicateEngine`, `ConfidenceEngine`, or `EditorialMappingEngine`.
- **New Source / re-tiered Source**: add a line to
  `config/sources.yaml` (and optionally `confidence_weights.yaml` for a
  bespoke weight). No code change.
- **New EventType**: add it to `models/enums.py`'s `EventType`, then add
  one line to `config/editorial_mapping.yaml`. `MATCHERS`-style
  extensibility is intentionally not needed here since there's only one
  matching concern (Editorial Mapping), unlike TNC Magazine's
  daily/monthly Issue matchers.
- **New Event kind requiring different Duplicate rules** (e.g. a
  Special/Recurring event where "same artist + same week" should count
  as duplicate instead of "same artist + same date"): `DuplicateEngine`
  is a single class today; splitting it into a strategy-per-EventType
  would be the natural next step, following the same "small interface +
  registry" shape already used for `EventProvider`/`ProviderRegistry`.
- **Persistent EventQueue**: implement `EventQueue` (4 abstract methods)
  against a real store; `CollectorPipeline` and `PromptGenerator` take it
  via constructor injection, so nothing else changes.
- **Editorial Guideline changes**: edit `docs/editorial-guideline.md`
  directly — every future Prompt picks up the new text automatically,
  no code change.
- **New StoryType / reclassification rule**: add the enum value
  (`models/enums.py`) and a line in `config/story_classification.yaml`.
  No code change to `StoryLayer` unless the new type needs an override
  rule shaped differently from "Breaking" (recency + confidence) — in
  which case add a new private method next to `_is_breaking()`.
- **New Editorial Decision rule / threshold**: `config/
  editorial_decision.yaml` for threshold tuning; a genuinely new decision
  path (e.g. a time-based auto-expiry) would be a new `elif` branch in
  `EditorialDecisionEngine.decide()`, keeping the same first-match-wins
  shape.
- **Persistent StoryCandidate storage**: none exists yet (Phase 3 is
  stateless — every `EditorialDesk` call recomputes from the
  `EditorialEvent`s it's given). Would follow the same interface-first
  pattern as `EventQueue` if added.

## Roadmap

Per the spec (sections XVI/Phase 2/Phase 3 preambles), every phase so
far is architecture + rule-based logic only. Deliberately still not
implemented, by explicit instruction, through Phase 3:

- No RSS ingestion.
- No Cloudflare Worker.
- No API (REST or otherwise) exposing this module.
- No call to ChatGPT, Claude, or any other AI/LLM API.
- No concrete `EventProvider` hitting a real network endpoint
  (Spotify/Apple Music/YouTube/Facebook/Instagram integrations all still
  need to be written against real APIs/auth — `NewsProvider`, Phase 2,
  reads local JSON fixtures only, still no network).
- No persistent `EventQueue` or `StoryCandidate` store (in-memory only).
- No UI of any kind for editors to browse the queue, dashboard, or
  trigger a Prompt.

### Phase 4 candidates (not started — CLI only, per this phase's report)

- A minimal CLI (`python -m editorial-intelligence.cli`, or a script
  under `editorial-intelligence/`) to run `CollectorPipeline.run()` +
  `EditorialDesk.process_all()` once and print `DashboardEngine.compute()`
  / `EventQueue.list_pending_review()` — still no API, no Worker, still
  human-in-the-loop only, still no AI call.
- First concrete `EventProvider`s for the Tier 1 sources that have public
  APIs (Spotify Artist, YouTube Official) — read-only, rate-limited, each
  independently testable against `providers/base.py`'s contract (this
  would be real network I/O, explicitly out of scope until a phase asks
  for it by name).
- Persisting the `EventQueue` to a JSON file between runs (still not a
  database, just durable across process restarts) implementing the
  existing `EventQueue` interface.
- Splitting `DuplicateEngine` into per-EventType strategies if/when a new
  EventType needs different matching rules than "2-of-4 secondary
  fields".
