"""Editorial Dashboard (Phase 7) — the only UI layer of Editorial OS.

Presentation only: reads JSON/YAML state Phase 1-6 already produced,
never calls CollectorPipeline/EditorialDesk/Workspace/WorkerRunner.

Like `editorial-intelligence`, this directory's name has a hyphen and
is therefore not a legal Python package identifier — it is never meant
to be `import`ed as `editorial_dashboard`. It is run directly:

    python editorial-dashboard/app.py

app.py and router.py are plain sibling modules within this directory
(no cross-package import collisions like `editorial-intelligence`'s
`queue` subpackage), so they reach each other with an ordinary
`sys.path.insert` + bare `import router` — see app.py.
"""
