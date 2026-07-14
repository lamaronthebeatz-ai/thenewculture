"""ProviderRegistry — where the collector looks up which Providers to run.

Phase 1 registers zero real providers (section XVI: no RSS, no API, no
Worker yet). The registry itself is still real, tested infrastructure so
Phase 1.1 only has to write Provider subclasses and register them —
nothing about collector/pipeline.py has to change.
"""
from typing import Dict, List

from .base import EventProvider


class ProviderRegistry:
    """Simple in-memory registry, keyed by `EventProvider.source_name`.

    Deliberately not a singleton/global — collector/pipeline.py receives
    a registry instance via constructor injection, so tests can build a
    registry with fake providers without touching any shared state.
    """

    def __init__(self) -> None:
        self._providers: Dict[str, EventProvider] = {}

    def register(self, provider: EventProvider) -> None:
        name = provider.source_name
        if name in self._providers:
            raise ValueError(f"Provider already registered for source '{name}'")
        self._providers[name] = provider

    def unregister(self, source_name: str) -> None:
        self._providers.pop(source_name, None)

    def get(self, source_name: str) -> EventProvider:
        return self._providers[source_name]

    def all(self) -> List[EventProvider]:
        return list(self._providers.values())

    def __len__(self) -> int:
        return len(self._providers)
