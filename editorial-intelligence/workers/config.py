"""Worker Config (Phase 6) — loads workers/worker.yaml: schedule /
providers / limits / retry / logging.

A deliberately self-contained loader — NOT config/loader.py (Phase 1,
locked). Phase 6 is integration-only; rather than adding a new function
to a frozen file, this module owns its own tiny YAML read path.
"""
import os
from typing import Any, Dict, Optional

import yaml

_WORKERS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CONFIG_PATH = os.path.join(_WORKERS_DIR, "worker.yaml")


def load_worker_config(path: Optional[str] = None) -> Dict[str, Any]:
    with open(path or _DEFAULT_CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)
