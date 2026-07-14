# Editorial Intelligence

Infrastructure layer for TNC's editorial desk. It does **not** write
articles and does **not** call any AI/LLM API — it collects *Editorial
Events*, scores and deduplicates them, and generates a *Prompt* that an
editor copies into an external tool by hand. It has zero dependency on
the public site: `build.py`, `admin/config.yml`, `content/`, and
`public/` are never imported or modified by anything in this folder.

Read `docs/editorial-intelligence.md` for the full architecture,
`docs/editorial-guideline.md` for the editorial voice/style rules the
Prompt Generator embeds in every prompt.

## Why this folder has no `__init__.py`

`editorial-intelligence` has a hyphen in its name, which is not a legal
Python identifier — `import editorial-intelligence` cannot work no
matter what is inside it. This directory is therefore a **package root**
(like a `src/` folder), not itself a package. The actual Python packages
are its children — `models`, `providers`, `events`, `queue`, `collector`,
`prompt`, `config` — each a normal, hyphen-free, importable package.

Anything that imports from this module needs `editorial-intelligence/`
itself on `sys.path` (not the repo root). Two ways to get that:

- Running the test suite: `pytest editorial-intelligence/tests` — the
  `conftest.py` at the root of this folder does the `sys.path` insertion
  automatically, pytest picks it up on its own.
- A standalone script: add
  `sys.path.insert(0, os.path.dirname(__file__))` before importing, the
  same way `editorial-intelligence/tests/conftest.py` does. See
  `docs/editorial-intelligence.md` → "Running it" for a full example.
