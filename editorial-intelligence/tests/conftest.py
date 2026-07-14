"""Loads the `editorial-intelligence` directory as an importable package
named `editorial_intelligence` (underscore — a valid Python identifier),
without ever adding a bare `queue` (or `models`, `events`, etc.) to
sys.path as a top-level name. See ../__init__.py for the full rationale:
this package has a subpackage literally named `queue`, the same name as
the Python standard library module, so top-level sibling imports are
unsafe. Every file inside uses relative imports instead
(`from ..models.event import ...`) and reaches its siblings through this
one registered package, never through sys.path search order.
"""
import importlib.util
import os
import sys

_PACKAGE_NAME = "editorial_intelligence"
_PACKAGE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ensure_loaded() -> None:
    if _PACKAGE_NAME in sys.modules:
        return
    init_path = os.path.join(_PACKAGE_ROOT, "__init__.py")
    spec = importlib.util.spec_from_file_location(
        _PACKAGE_NAME, init_path, submodule_search_locations=[_PACKAGE_ROOT]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[_PACKAGE_NAME] = module
    spec.loader.exec_module(module)


_ensure_loaded()
