"""Event Validation (Phase 2, section II).

This is a standalone utility, deliberately NOT a change to
`providers.base.EventProvider.validate()` (Phase 1, already completed —
that abstract method's contract, `-> bool`, is untouched). A Provider
that wants the exact checks section II lists can call `validate_event()`
internally and convert the exception to a bool itself (see
`providers/news_provider.py`'s `validate()` for the reference
implementation) — that keeps the existing interface stable while still
giving every check section II asks for, with a real exception any code
that wants stricter handling can catch directly.
"""
from typing import Iterable, Optional
from urllib.parse import urlparse

from ..models.enums import EventType
from ..models.event import EditorialEvent


class ValidationError(Exception):
    """Raised by validate_event() — one specific rule failed. The message
    names which rule, per section II's list."""


def _is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def validate_event(event: EditorialEvent, existing_ids: Optional[Iterable[str]] = None) -> None:
    """Raises ValidationError on the first rule that fails; returns None
    (no exception) if the event passes every check. Rules, in order,
    exactly per section II:

      - title bắt buộc
      - source bắt buộc
      - published_at bắt buộc
      - artist ít nhất 1 (event.artist is a single str field in the
        Phase 1 model — "at least 1" is satisfied by it being non-blank;
        the model was not changed to a list to avoid refactoring an
        already-completed module)
      - event_type hợp lệ
      - url hợp lệ (checked per-Source: models.Source.url is where a URL
        actually lives — EditorialEvent has no top-level `url` field, and
        adding one would be a model change beyond this phase's scope)
      - không duplicate id
    """
    if not event.title or not event.title.strip():
        raise ValidationError("title bắt buộc")

    if not event.sources:
        raise ValidationError("source bắt buộc (event.sources rỗng)")

    if not event.published_at or not str(event.published_at).strip():
        raise ValidationError("published_at bắt buộc")

    if not event.artist or not event.artist.strip():
        raise ValidationError("artist ít nhất 1 (event.artist rỗng)")

    if not isinstance(event.event_type, EventType):
        raise ValidationError(f"event_type không hợp lệ: {event.event_type!r}")

    for source in event.sources:
        if source.url and not _is_valid_url(source.url):
            raise ValidationError(f"url không hợp lệ: {source.url!r}")

    if existing_ids is not None and event.id in set(existing_ids):
        raise ValidationError(f"duplicate id: {event.id}")
