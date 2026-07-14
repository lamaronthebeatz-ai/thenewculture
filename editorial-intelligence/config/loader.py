"""Loads the YAML data files in this folder. The only place in Editorial
Intelligence allowed to know these files exist on disk — every consumer
(events/confidence.py, events/mapping.py, providers/registry bootstrap)
goes through here instead of opening its own file handle, so there is
exactly one code path to change if the storage format ever changes."""
import os
from typing import Any, Dict, List

import yaml

_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_yaml(filename: str) -> Any:
    path = os.path.join(_CONFIG_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_sources() -> Dict[str, List[Dict[str, str]]]:
    """Returns {"tier_1": [...], "tier_2": [...], "tier_3": [...]}."""
    return _load_yaml("sources.yaml")


def load_confidence_weights() -> Dict[str, Any]:
    """Returns source_weights / default_tier_weights / duplicate_source_bonus
    / prompt_eligibility_threshold — see confidence_weights.yaml."""
    return _load_yaml("confidence_weights.yaml")


def load_editorial_mapping() -> Dict[str, str]:
    """Returns {event_type_value: series_slug}."""
    return _load_yaml("editorial_mapping.yaml")


def load_event_categories() -> Dict[str, Any]:
    """Phase 2 (section VI) addition. Returns categories /
    related_series / homepage_eligible_event_types /
    homepage_confidence_threshold / magazine_eligible_event_types /
    magazine_confidence_threshold / search_weight_base /
    search_weight_confidence_multiplier — see event_categories.yaml.
    Deliberately a separate file/function from
    load_editorial_mapping(), so that function's existing return shape
    (Phase 1, already load-bearing) never changes."""
    return _load_yaml("event_categories.yaml")


def source_tier_lookup() -> Dict[str, str]:
    """Flattens sources.yaml into {source_name: tier_value}, e.g.
    {"Official Website": "tier_1", ...} — the shape events/confidence.py
    and providers actually want, without repeating the tier-flattening
    logic anywhere else."""
    raw = load_sources()
    lookup: Dict[str, str] = {}
    for tier, entries in raw.items():
        for entry in entries:
            lookup[entry["name"]] = tier
    return lookup
