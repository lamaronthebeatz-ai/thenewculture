# Editorial Intelligence v1.0 — Architecture

Status: Phase 1 (foundation only — see "Roadmap" for what is deliberately
not built yet).

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
│   ├── enums.py                 #   EventType, EventStatus, SourceTier
│   ├── source.py                #   Source
│   ├── event.py                 #   EditorialEvent (+ id generation)
│   └── prompt.py                #   EditorialPrompt
├── providers/                   # Provider Interface (section V)
│   ├── base.py                  #   EventProvider ABC: fetch/normalize/validate
│   └── registry.py              #   ProviderRegistry
├── events/                      # operations ON events
│   ├── normalizer.py             #   shared text-cleanup helpers
│   ├── confidence.py             #   Confidence Engine (section VII)
│   ├── duplicate.py               #   Duplicate Engine (section VIII)
│   └── mapping.py                #   Editorial Mapping (section IX)
├── queue/                       # EventQueue (section VIII/collector)
│   ├── interface.py              #   EventQueue ABC
│   └── in_memory.py              #   InMemoryEventQueue (only impl, Phase 1)
├── collector/                   # orchestration
│   └── pipeline.py                #   CollectorPipeline — wires everything above
├── prompt/                      # Prompt Generator (section X) — no AI call
│   ├── frontmatter.py            #   builds the Articles-collection-shaped dict
│   └── generator.py              #   assembles the full Prompt text
├── config/                      # DATA, not code — the "no hardcode" seam
│   ├── sources.yaml               #   Source Registry / tiers (section VI)
│   ├── confidence_weights.yaml    #   scoring table (section VII)
│   ├── editorial_mapping.yaml     #   event_type -> series (section IX)
│   └── loader.py                  #   the only file that opens these
├── docs/
│   ├── editorial-intelligence.md  # this file
│   └── editorial-guideline.md     # section XI — embedded into every Prompt
└── tests/
    ├── conftest.py                # loads this dir as `editorial_intelligence`
    ├── fakes.py                   # FakeProvider test double — not a real Source
    └── test_pipeline.py           # end-to-end smoke test (4 cases, all passing)
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

## Roadmap — explicitly NOT built in Phase 1

Per the spec (section XVI), Phase 1 is architecture only. Deliberately
not implemented:

- No RSS ingestion.
- No Cloudflare Worker.
- No API (REST or otherwise) exposing this module.
- No call to ChatGPT, Claude, or any other AI/LLM API.
- No concrete `EventProvider` hitting a real network endpoint
  (Spotify/Apple Music/YouTube/Facebook/Instagram integrations all still
  need to be written against real APIs/auth, which is out of scope here).
- No persistent `EventQueue` (in-memory only).
- No UI of any kind for editors to browse the queue or trigger a Prompt.

### Phase 1.1 candidates (not started)

- First concrete `EventProvider`s for the Tier 1 sources that have public
  APIs (Spotify Artist, YouTube Official) — read-only, rate-limited, each
  independently testable against `providers/base.py`'s contract.
- A minimal CLI (`python -m editorial-intelligence.cli`, or a script under
  `editorial-intelligence/`) to run `CollectorPipeline.run()` once and
  print `EventQueue.list_pending_review()` — still no API, no Worker,
  still human-in-the-loop only.
- Persisting the `EventQueue` to a JSON file between runs (still not a
  database, just durable across process restarts) implementing the
  existing `EventQueue` interface.
- Splitting `DuplicateEngine` into per-EventType strategies if/when a new
  EventType needs different matching rules than "2-of-3 secondary
  fields".
