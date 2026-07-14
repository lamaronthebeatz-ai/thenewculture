"""Phase 7 (Editorial Dashboard) — router.py tests.

Everything here either reads plain dicts constructed in-test (matching
the exact JSON shape scripts/editorial.py's Phase 4/5/6 persistence
already writes) or spins up the real stdlib HTTP server on a loopback,
auto-assigned port (no external network, no real Editorial OS state
touched — every data path is monkeypatched to a tmp_path). Nothing in
this file calls CollectorPipeline/EditorialDesk/Workspace/WorkerRunner.
"""
import http.client
import importlib
import json
import os
import sys
import threading

import pytest

_DASHBOARD_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _DASHBOARD_DIR not in sys.path:
    sys.path.insert(0, _DASHBOARD_DIR)

router = importlib.import_module("router")


@pytest.fixture(autouse=True)
def _isolated_state(tmp_path, monkeypatch):
    """Every test gets its own state dir — never touches the real
    editorial-intelligence/.cli-state/ or leaves files behind."""
    state_dir = tmp_path / "cli-state"
    monkeypatch.setattr(router, "STATE_DIR", str(state_dir))
    monkeypatch.setattr(router, "STORIES_FILE", str(state_dir / "stories.json"))
    monkeypatch.setattr(router, "ARTICLES_FILE", str(state_dir / "articles.json"))
    monkeypatch.setattr(router, "WORKER_RUNS_FILE", str(state_dir / "worker_runs.json"))
    monkeypatch.setattr(router, "DASHBOARD_FILE", str(state_dir / "dashboard.json"))
    yield


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _story_dict(title="Album X", artist="Nghệ Sĩ A", status="pending_review", decision="publish",
                 priority=90, confidence=80, series="tnc-records", story_type="release", event_id=None):
    return {
        "event": {
            "id": event_id or f"id-{title}", "title": title, "artist": artist,
            "event_type": "album_release", "description": "mô tả", "published_at": "2026-08-01",
            "sources": [{"name": "Official Website", "tier": "tier_1", "url": "https://example.com"}],
            "confidence": confidence, "language": "vi", "country": "VN", "platform": None, "image": None,
            "status": status, "related_artists": ["Nghệ Sĩ D"], "related_profiles": [],
            "suggested_series": series, "suggested_tags": ["#TNC"],
            "primary_source": None, "mapping_result": None,
        },
        "story_type": story_type, "priority_score": priority, "decision": decision,
        "decision_reason": "test", "assignment": {
            "suggested_series": series, "suggested_category": "Release", "suggested_tags": ["#TNC"],
            "suggested_profiles": ["nghe-si-a"], "suggested_internal_links": ["Nghệ Sĩ D"],
            "suggested_length": "400-600",
        },
        "editorial_notes": [],
    }


def _article_dict(story, status="new", assigned_editor=None, prompt_path=None, markdown_path=None, history=None):
    return {
        "story": story, "status": status, "assigned_editor": assigned_editor,
        "prompt_path": prompt_path, "markdown_path": markdown_path,
        "created": "2026-01-01T00:00:00+00:00", "updated": "2026-01-01T00:00:00+00:00", "published": None,
        "history": history if history is not None else [
            {"label": "Created", "status": "new", "timestamp": "2026-01-01T00:00:00+00:00", "note": None},
        ],
    }


def _dashboard_dict():
    return {
        "pending": 2, "ready": 1, "writing": 0, "review": 0, "published": 0,
        "cover_story": "Album X", "top_story": "Album X",
        "issue_planning": [{"title": "Album X", "priority": 90, "series": "tnc-records"}],
        "series_balance": {"tnc-records": {"target": 3, "current": 1, "gap": 2}},
        "average_confidence": 50.0, "average_priority": 50.0,
    }


# ---------------------------------------------------------------------
# Data loaders
# ---------------------------------------------------------------------

def test_load_stories_returns_empty_list_when_missing():
    assert router.load_stories() == []


def test_load_articles_returns_empty_list_when_missing():
    assert router.load_articles() == []


def test_load_worker_runs_returns_empty_list_when_missing():
    assert router.load_worker_runs() == []


def test_load_dashboard_returns_none_when_missing():
    assert router.load_dashboard() is None


def test_load_stories_reads_real_json():
    story = _story_dict()
    _write_json(router.STORIES_FILE, [story])
    loaded = router.load_stories()
    assert loaded == [story]


def test_load_dashboard_reads_real_json():
    dashboard = _dashboard_dict()
    _write_json(router.DASHBOARD_FILE, dashboard)
    assert router.load_dashboard() == dashboard


# ---------------------------------------------------------------------
# _find_article
# ---------------------------------------------------------------------

def test_find_article_exact_and_prefix_match():
    article = _article_dict(_story_dict(event_id="abcdef1234567890"))
    assert router._find_article([article], "abcdef1234567890") is article
    assert router._find_article([article], "abcdef12") is article


def test_find_article_returns_none_for_no_match():
    article = _article_dict(_story_dict(event_id="abcdef1234567890"))
    assert router._find_article([article], "nope") is None


def test_find_article_returns_none_for_ambiguous_prefix():
    a = _article_dict(_story_dict(event_id="abc111"))
    b = _article_dict(_story_dict(event_id="abc222"))
    assert router._find_article([a, b], "abc") is None


# ---------------------------------------------------------------------
# Template engine / layout
# ---------------------------------------------------------------------

def test_fill_replaces_all_placeholders():
    out = router._fill("hello {{NAME}}, bye {{NAME}}", {"NAME": "world"})
    assert out == "hello world, bye world"


def test_render_page_marks_active_nav_item():
    out = router.render_page("queue", "Queue", "<p>body</p>")
    assert "nav__item--active" in out
    assert '<p>body</p>' in out
    assert "<title>Queue" in out


def test_render_page_includes_all_nav_items():
    out = router.render_page("dashboard", "Dashboard", "")
    for _, href, label, _ in router.NAV_ITEMS:
        assert href in out
        assert label in out


# ---------------------------------------------------------------------
# Dashboard page
# ---------------------------------------------------------------------

def test_build_dashboard_page_empty_state():
    out = router.build_dashboard_page()
    assert "Chưa có dữ liệu" in out
    assert "editorial worker run" in out


def test_build_dashboard_page_populated():
    _write_json(router.DASHBOARD_FILE, _dashboard_dict())
    _write_json(router.STORIES_FILE, [_story_dict()])
    out = router.build_dashboard_page()
    assert "Album X" in out
    assert "50.0" in out
    assert "tnc-records" in out
    assert "Pending" in out and "Published" in out


# ---------------------------------------------------------------------
# Queue page
# ---------------------------------------------------------------------

def test_build_queue_page_empty_state():
    out = router.build_queue_page()
    assert "Không có story nào đang Pending Review" in out


def test_build_queue_page_only_shows_pending_review():
    pending = _story_dict(title="Pending One", status="pending_review", event_id="id-1")
    prompted = _story_dict(title="Already Prompted", status="prompted", event_id="id-2")
    _write_json(router.STORIES_FILE, [pending, prompted])
    out = router.build_queue_page()
    assert "Pending One" in out
    assert "Already Prompted" not in out
    assert "Generate Prompt" in out
    assert 'data-cli="editorial prompt' in out
    assert "Reject" in out and "disabled" in out


# ---------------------------------------------------------------------
# Article pages
# ---------------------------------------------------------------------

def test_build_article_list_page_empty_state():
    out = router.build_article_list_page()
    assert "Chưa có Article nào" in out


def test_build_article_list_page_populated():
    article = _article_dict(_story_dict(title="Album X", event_id="id-1"))
    _write_json(router.ARTICLES_FILE, [article])
    out = router.build_article_list_page()
    assert "Album X" in out
    assert "/article/id-1" in out


def test_build_article_detail_page_unknown_id():
    out = router.build_article_detail_page("nope")
    assert "Không tìm thấy Article" in out


def test_build_article_detail_page_shows_metadata_and_missing_prompt():
    article = _article_dict(_story_dict(title="Album X", event_id="id-1"))
    _write_json(router.ARTICLES_FILE, [article])
    out = router.build_article_detail_page("id-1")
    assert "Album X" in out
    assert "editorial prompt id-1" in out  # short id fallback since full id < 8 chars uses itself
    assert "chưa có" in out
    assert 'id="copyPromptBtn"' in out and "disabled" in out


def test_build_article_detail_page_reads_prompt_and_markdown_files(tmp_path):
    prompt_file = tmp_path / "prompt.txt"
    prompt_file.write_text("PROMPT CONTENT", encoding="utf-8")
    markdown_file = tmp_path / "draft.md"
    markdown_file.write_text("# Markdown Content", encoding="utf-8")

    article = _article_dict(
        _story_dict(title="Album X", event_id="id-1"),
        prompt_path=str(prompt_file), markdown_path=str(markdown_file),
    )
    _write_json(router.ARTICLES_FILE, [article])
    out = router.build_article_detail_page("id-1")
    assert "PROMPT CONTENT" in out
    assert "# Markdown Content" in out
    assert 'id="copyPromptBtn" data-target="promptText" ' in out  # no disabled attribute


# ---------------------------------------------------------------------
# Worker page
# ---------------------------------------------------------------------

def test_build_worker_page_no_runs():
    out = router.build_worker_page()
    assert "Chưa có lần chạy nào" in out
    assert 'data-cli="editorial worker run"' in out


def test_build_worker_page_with_runs():
    _write_json(router.WORKER_RUNS_FILE, [{
        "run_id": "abc123", "started_at": "2026-01-01T00:00:00+00:00",
        "finished_at": "2026-01-01T00:00:01+00:00", "duration_seconds": 1.0,
        "events_processed": 3, "errors": [], "messages": [],
    }])
    out = router.build_worker_page()
    assert "abc123" in out
    assert "Worker Status" in out
    assert "ok" in out


# ---------------------------------------------------------------------
# History pages
# ---------------------------------------------------------------------

def test_build_history_list_page_empty_state():
    out = router.build_history_list_page()
    assert "Chưa có Article nào" in out


def test_build_history_list_page_populated():
    article = _article_dict(_story_dict(title="Album X", event_id="id-1"))
    _write_json(router.ARTICLES_FILE, [article])
    out = router.build_history_list_page()
    assert "Album X" in out
    assert "/history/id-1" in out


def test_build_history_detail_page_shows_timeline():
    history = [
        {"label": "Created", "status": "new", "timestamp": "2026-01-01T00:00:00+00:00", "note": None},
        {"label": "Queued for Review", "status": "pending_review", "timestamp": "2026-01-01T00:00:01+00:00", "note": "ghi chú"},
    ]
    article = _article_dict(_story_dict(title="Album X", event_id="id-1"), history=history)
    _write_json(router.ARTICLES_FILE, [article])
    out = router.build_history_detail_page("id-1")
    assert "Created" in out
    assert "Queued for Review" in out
    assert "ghi chú" in out


def test_build_history_detail_page_unknown_id():
    out = router.build_history_detail_page("nope")
    assert "Không tìm thấy Article" in out


# ---------------------------------------------------------------------
# Settings page — reads REAL config files (readonly, safe)
# ---------------------------------------------------------------------

def test_build_settings_page_reads_real_config_files():
    out = router.build_settings_page()
    assert "worker.yaml" in out
    assert "sources.yaml" in out
    assert "confidence.yaml" in out
    assert "series.yaml" in out
    assert "không tìm thấy file" not in out


# ---------------------------------------------------------------------
# HTTP server — real stdlib server on a loopback, auto-assigned port.
# ---------------------------------------------------------------------

@pytest.fixture
def live_server():
    server = router.make_server("127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    thread.join(timeout=5)


def _get(server, path):
    conn = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=5)
    conn.request("GET", path)
    resp = conn.getresponse()
    body = resp.read()
    conn.close()
    return resp.status, resp.getheader("Content-Type"), body


def test_server_serves_all_pages(live_server):
    for path in ("/", "/dashboard", "/queue", "/article", "/worker", "/history", "/settings"):
        status, content_type, body = _get(live_server, path)
        assert status == 200, path
        assert "text/html" in content_type
        assert b"<html" in body


def test_server_serves_article_and_history_detail_routes(live_server):
    article = _article_dict(_story_dict(title="Album X", event_id="id-1"))
    _write_json(router.ARTICLES_FILE, [article])
    status, _, body = _get(live_server, "/article/id-1")
    assert status == 200
    assert b"Album X" in body
    status, _, body = _get(live_server, "/history/id-1")
    assert status == 200


def test_server_serves_static_assets(live_server):
    status, content_type, body = _get(live_server, "/static/style.css")
    assert status == 200
    assert "text/css" in content_type
    assert len(body) > 0

    status, content_type, _ = _get(live_server, "/static/dashboard.js")
    assert status == 200
    assert "javascript" in content_type


def test_server_404_for_unknown_route(live_server):
    status, _, _ = _get(live_server, "/nope")
    assert status == 404


def test_server_blocks_path_traversal(live_server):
    status, _, _ = _get(live_server, "/static/%2e%2e/router.py")
    assert status == 403


def test_server_404_for_missing_static_file(live_server):
    status, _, _ = _get(live_server, "/static/does-not-exist.css")
    assert status == 404
