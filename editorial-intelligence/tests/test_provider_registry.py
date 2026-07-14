"""ProviderRegistry — register/unregister/get/all/len."""
import pytest

from editorial_intelligence.providers.registry import ProviderRegistry

from fakes import FakeProvider


def _fake(name):
    return FakeProvider(name, [])


def test_register_and_get():
    registry = ProviderRegistry()
    provider = _fake("Official Website")
    registry.register(provider)
    assert registry.get("Official Website") is provider
    assert len(registry) == 1


def test_register_duplicate_source_name_raises():
    registry = ProviderRegistry()
    registry.register(_fake("Official Website"))
    with pytest.raises(ValueError, match="already registered"):
        registry.register(_fake("Official Website"))


def test_all_returns_every_registered_provider():
    registry = ProviderRegistry()
    a, b = _fake("A"), _fake("B")
    registry.register(a)
    registry.register(b)
    assert set(registry.all()) == {a, b}


def test_unregister_removes_provider():
    registry = ProviderRegistry()
    registry.register(_fake("A"))
    registry.unregister("A")
    assert len(registry) == 0


def test_unregister_missing_source_is_a_no_op():
    registry = ProviderRegistry()
    registry.unregister("does-not-exist")  # must not raise
    assert len(registry) == 0
