"""
Editorial Intelligence — infrastructure layer for TNC's editorial desk.

This package does NOT write articles, does NOT call any AI/LLM API, and
does NOT depend on any part of the public site (build.py, CMS, Homepage,
Magazine, Profiles, Discovery, Search, Promotion). It is a fully
independent module: an editor (or a future automation) runs it, reviews
the Editorial Events it collects, and copies the generated Prompt into an
external tool. Nothing here touches content/, admin/, scripts/ or public/.

See docs/editorial-intelligence.md for the full architecture write-up.

Why this file matters more than a typical `__init__.py`: the directory
`editorial-intelligence` has a hyphen, which is not a legal Python
identifier, so it can never be reached by a normal `import
editorial-intelligence` statement — no directory rename or `__init__.py`
trick fixes that part. What this file DOES make possible is everything
*inside* the package using normal relative imports (`from ..models.event
import EditorialEvent`, etc.), which matters because one of the
subpackages here is named `queue` — the same name as a Python standard
library module. If this tree were imported by adding its own directory to
`sys.path` and importing siblings as bare top-level names (`import
queue`), our `queue/` would collide with (and unpredictably shadow or be
shadowed by) the real standard-library `queue` for every other bare
`import queue` in the same process. Relative imports never touch the
top-level `queue` name at all, so the collision cannot happen.

Loading this package therefore always goes through one small, explicit
step — see `tests/conftest.py` for the version used by the test suite:

    import importlib.util, os, sys
    root = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        "editorial_intelligence", os.path.join(root, "__init__.py"),
        submodule_search_locations=[root],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["editorial_intelligence"] = module
    spec.loader.exec_module(module)

After that, `from editorial_intelligence.models.event import
EditorialEvent` (and so on) works exactly like importing any ordinary
installed package — the hyphen only ever mattered for this one loading
step.
"""
