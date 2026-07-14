"""Editorial Dashboard router (Phase 7) — the ONLY place this module
touches Editorial OS data, and it only ever *reads* it.

Every page builder below opens a JSON file already written by the CLI
(`scripts/editorial.py`, Phases 4-6: stories.json, articles.json,
worker_runs.json, dashboard.json) or a YAML config file already shipped
with Editorial OS (Phases 1/6). Nothing here calls CollectorPipeline,
EditorialDesk, Workspace, or WorkerRunner — those engines never run as a
side effect of loading a page. The two exceptions, HealthEngine and
Scheduler (both Phase 6, pure/side-effect-free), are reused rather than
re-implemented for the Worker page's status computation, the same
"reuse, don't duplicate logic" rule every previous phase followed
(see workers/health.py, workers/scheduler.py — neither is modified).

Actions that would *mutate* state (Generate Prompt, Generate Markdown,
Reject, Run Now, Export, Archive) are rendered as "copy the CLI command"
buttons (see static/dashboard.js) instead of live-triggering anything —
this dashboard is a Presentation Layer only, per the Phase 7 spec:
"Dashboard chỉ đọc JSON hiện có", "KHÔNG backend mới". Only genuinely
read-only actions (Open, Refresh, Copy Prompt of already-generated text,
Open Markdown as an in-page anchor) are wired to do something for real.
"""
import html
import importlib.util
import json
import mimetypes
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DASHBOARD_ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(DASHBOARD_ROOT)
EI_ROOT = os.path.join(REPO_ROOT, "editorial-intelligence")
STATE_DIR = os.path.join(EI_ROOT, ".cli-state")
CONFIG_DIR = os.path.join(EI_ROOT, "config")
WORKERS_DIR = os.path.join(EI_ROOT, "workers")

STORIES_FILE = os.path.join(STATE_DIR, "stories.json")
ARTICLES_FILE = os.path.join(STATE_DIR, "articles.json")
WORKER_RUNS_FILE = os.path.join(STATE_DIR, "worker_runs.json")
DASHBOARD_FILE = os.path.join(STATE_DIR, "dashboard.json")

TEMPLATES_DIR = os.path.join(DASHBOARD_ROOT, "templates")
STATIC_DIR = os.path.join(DASHBOARD_ROOT, "static")


# ----------------------------------------------------------------------
# editorial_intelligence bootstrap — same technique as tests/conftest.py
# and scripts/editorial.py (the directory has a hyphen and a `queue`
# subpackage that collides with the stdlib module of the same name, so
# it cannot be reached with a bare sys.path append + import). This
# module only ever needs Phase 6's already-existing, pure HealthEngine/
# Scheduler/load_worker_config/RunLog — never Phase 1-5's engines.
# ----------------------------------------------------------------------

def _load_editorial_intelligence():
    if "editorial_intelligence" in sys.modules:
        return sys.modules["editorial_intelligence"]
    spec = importlib.util.spec_from_file_location(
        "editorial_intelligence", os.path.join(EI_ROOT, "__init__.py"),
        submodule_search_locations=[EI_ROOT],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["editorial_intelligence"] = module
    spec.loader.exec_module(module)
    return module


_load_editorial_intelligence()

from editorial_intelligence.workers.config import load_worker_config  # noqa: E402
from editorial_intelligence.workers.health import HealthEngine  # noqa: E402
from editorial_intelligence.workers.logger import RunLog  # noqa: E402
from editorial_intelligence.workers.scheduler import Scheduler  # noqa: E402


# ----------------------------------------------------------------------
# Data reading — plain json.load()/file reads only, no engine calls.
# ----------------------------------------------------------------------

def _load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_stories():
    return _load_json(STORIES_FILE, [])


def load_articles():
    return _load_json(ARTICLES_FILE, [])


def load_worker_runs():
    return _load_json(WORKER_RUNS_FILE, [])


def load_dashboard():
    return _load_json(DASHBOARD_FILE, None)


def _read_text_file(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return f.read()


def _run_dict_to_runlog(d) -> RunLog:
    return RunLog(
        run_id=d["run_id"], started_at=d["started_at"], finished_at=d.get("finished_at"),
        duration_seconds=d.get("duration_seconds"), events_processed=d.get("events_processed", 0),
        errors=list(d.get("errors", [])), messages=list(d.get("messages", [])),
    )


def _find_article(articles, article_id):
    for a in articles:
        if a["story"]["event"]["id"] == article_id:
            return a
    matches = [a for a in articles if a["story"]["event"]["id"].startswith(article_id)]
    return matches[0] if len(matches) == 1 else None


# ----------------------------------------------------------------------
# Tiny template engine — no new dependency (no Jinja2): templates are
# plain HTML files with `{{PLACEHOLDER}}` tokens, filled in by simple
# string replacement. Every dynamic value passed in is pre-escaped by
# the caller (html.escape) before being placed in `context`.
# ----------------------------------------------------------------------

def _read_template(name: str) -> str:
    with open(os.path.join(TEMPLATES_DIR, name), encoding="utf-8") as f:
        return f.read()


def _fill(template_str: str, context: dict) -> str:
    out = template_str
    for key, value in context.items():
        out = out.replace("{{" + key + "}}", value)
    return out


NAV_ITEMS = [
    ("dashboard", "/", "Dashboard", "dashboard"),
    ("queue", "/queue", "Queue", "queue"),
    ("article", "/article", "Article", "article"),
    ("worker", "/worker", "Worker", "worker"),
    ("history", "/history", "History", "history"),
    ("settings", "/settings", "Settings", "settings"),
]


def _render_nav(active: str) -> str:
    items = []
    for key, href, label, icon in NAV_ITEMS:
        cls = "nav__item nav__item--active" if key == active else "nav__item"
        items.append(
            f'<a class="{cls}" href="{href}">'
            f'<img class="nav__icon" src="/static/icons/{icon}.svg" alt="" width="18" height="18">'
            f'{html.escape(label)}</a>'
        )
    return "\n".join(items)


def render_page(active: str, title: str, content: str) -> str:
    layout = _read_template("_layout.html")
    return _fill(layout, {"TITLE": html.escape(title), "NAV": _render_nav(active), "CONTENT": content})


def _stat_tile(label: str, value) -> str:
    return (
        f'<div class="tile"><div class="tile__value">{html.escape(str(value))}</div>'
        f'<div class="tile__label">{html.escape(label)}</div></div>'
    )


# ----------------------------------------------------------------------
# Dashboard page
# ----------------------------------------------------------------------

def build_dashboard_page() -> str:
    dashboard = load_dashboard()

    if dashboard is None:
        body = (
            '<p class="empty">Chưa có dữ liệu — chạy '
            '<code>editorial worker run</code> hoặc <code>editorial collect</code> trước.</p>'
        )
        content = _fill(_read_template("dashboard.html"), {"BODY": body})
        return render_page("dashboard", "Dashboard", content)

    stories = load_stories()

    tiles = "".join([
        _stat_tile("Pending", dashboard["pending"]),
        _stat_tile("Ready", dashboard["ready"]),
        _stat_tile("Writing", dashboard["writing"]),
        _stat_tile("Review", dashboard["review"]),
        _stat_tile("Published", dashboard["published"]),
    ])

    confidence = dashboard["average_confidence"]
    priority = dashboard["average_priority"]
    conf_text = f"{confidence:.1f}" if confidence is not None else "(n/a)"
    prio_text = f"{priority:.1f}" if priority is not None else "(n/a)"

    balance_rows = "".join(
        f'<tr><td>{html.escape(series)}</td><td>{info["target"]}</td>'
        f'<td>{info["current"]}</td><td>{info["gap"]}</td></tr>'
        for series, info in sorted(dashboard["series_balance"].items())
    ) or '<tr><td colspan="4" class="empty">(chưa có dữ liệu)</td></tr>'

    issue_rows = "".join(
        f'<li><span class="badge">{item["priority"]}</span> {html.escape(item["title"])} '
        f'<span class="muted">({html.escape(item["series"] or "-")})</span></li>'
        for item in dashboard["issue_planning"]
    ) or '<li class="empty">(không có đề xuất)</li>'

    recent = sorted(stories, key=lambda s: s["event"].get("published_at") or "", reverse=True)[:5]
    recent_rows = "".join(
        f'<li><a href="/article/{html.escape(s["event"]["id"])}">{html.escape(s["event"]["title"])}</a> '
        f'<span class="muted">— {html.escape(s["event"]["artist"])}</span></li>'
        for s in recent
    ) or '<li class="empty">(chưa có sự kiện)</li>'

    body = f"""
    <section class="tiles">{tiles}</section>
    <section class="grid-2">
      <div class="card">
        <h2>Cover Story</h2>
        <p class="highlight">{html.escape(dashboard["cover_story"] or "(không có)")}</p>
        <h2>Top Story</h2>
        <p class="highlight">{html.escape(dashboard["top_story"] or "(không có)")}</p>
        <h2>Average Confidence</h2>
        <p class="highlight">{conf_text}</p>
        <h2>Average Priority</h2>
        <p class="highlight">{prio_text}</p>
      </div>
      <div class="card">
        <h2>Issue Planning</h2>
        <ul class="list">{issue_rows}</ul>
      </div>
    </section>
    <section class="card">
      <h2>Series Balance</h2>
      <table class="table">
        <thead><tr><th>Series</th><th>Target</th><th>Current</th><th>Gap</th></tr></thead>
        <tbody>{balance_rows}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Recent Events</h2>
      <ul class="list">{recent_rows}</ul>
    </section>
    """
    content = _fill(_read_template("dashboard.html"), {"BODY": body})
    return render_page("dashboard", "Dashboard", content)


# ----------------------------------------------------------------------
# Queue page
# ----------------------------------------------------------------------

def build_queue_page() -> str:
    stories = load_stories()
    pending = [s for s in stories if s["event"].get("status") == "pending_review"]

    if not pending:
        body = '<p class="empty">Không có story nào đang Pending Review — chạy <code>editorial collect</code> trước.</p>'
        content = _fill(_read_template("queue.html"), {"BODY": body})
        return render_page("queue", "Queue", content)

    cards = []
    for s in pending:
        event = s["event"]
        event_id = event["id"]
        decision = s.get("decision") or "(chưa quyết định)"
        cards.append(f"""
        <article class="card queue-card">
          <h3>{html.escape(event["title"])}</h3>
          <dl class="fields">
            <div><dt>Artist</dt><dd>{html.escape(event["artist"])}</dd></div>
            <div><dt>Series</dt><dd>{html.escape(event.get("suggested_series") or "-")}</dd></div>
            <div><dt>Confidence</dt><dd>{event.get("confidence", 0)}</dd></div>
            <div><dt>Priority</dt><dd>{s.get("priority_score", 0)}</dd></div>
            <div><dt>Decision</dt><dd>{html.escape(str(decision))}</dd></div>
            <div><dt>Story Type</dt><dd>{html.escape(s.get("story_type", "-"))}</dd></div>
          </dl>
          <div class="actions">
            <a class="btn" href="/article/{html.escape(event_id)}">Open</a>
            <button class="btn btn--cli" data-cli="editorial prompt {html.escape(event_id[:8])}">Generate Prompt</button>
            <button class="btn btn--cli" data-cli="editorial markdown {html.escape(event_id[:8])}">Generate Markdown</button>
            <button class="btn btn--disabled" disabled
                    title="Reject do EditorialDecisionEngine tự động quyết định (rule-based), không thể ghi đè từ Dashboard.">
              Reject
            </button>
          </div>
        </article>
        """)

    body = f'<section class="cards">{"".join(cards)}</section>'
    content = _fill(_read_template("queue.html"), {"BODY": body})
    return render_page("queue", "Queue", content)


# ----------------------------------------------------------------------
# Article pages (list + detail)
# ----------------------------------------------------------------------

def build_article_list_page() -> str:
    articles = load_articles()
    if not articles:
        body = '<p class="empty">Chưa có Article nào — chạy <code>editorial collect</code> rồi <code>editorial workspace</code>.</p>'
        content = _fill(_read_template("article.html"), {"BODY": body})
        return render_page("article", "Article", content)

    rows = "".join(
        f'<tr class="clickable-row" data-href="/article/{html.escape(a["story"]["event"]["id"])}">'
        f'<td>{html.escape(a["story"]["event"]["id"][:8])}</td>'
        f'<td>{html.escape(a["story"]["event"]["title"])}</td>'
        f'<td>{html.escape(a["status"])}</td>'
        f'<td>{html.escape(a["story"]["event"].get("suggested_series") or "-")}</td>'
        f'<td>{a["story"].get("priority_score", 0)}</td>'
        f'</tr>'
        for a in articles
    )
    body = f"""
    <table class="table table--clickable">
      <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Series</th><th>Priority</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    """
    content = _fill(_read_template("article.html"), {"BODY": body})
    return render_page("article", "Article", content)


def build_article_detail_page(article_id: str) -> str:
    articles = load_articles()
    article = _find_article(articles, article_id)
    if article is None:
        body = (
            f'<p class="empty">Không tìm thấy Article với id: {html.escape(article_id)}. '
            f'<a href="/article">Quay lại danh sách</a>.</p>'
        )
        content = _fill(_read_template("article.html"), {"BODY": body})
        return render_page("article", "Article", content)

    story = article["story"]
    event = story["event"]
    assignment = story.get("assignment") or {}
    full_id = event["id"]
    short_id = full_id[:8]

    history_rows = "".join(
        f'<li><span class="muted">{html.escape(h["timestamp"])}</span> — {html.escape(h["label"])}'
        + (f' <span class="muted">({html.escape(h["note"])})</span>' if h.get("note") else "")
        + "</li>"
        for h in article.get("history", [])
    ) or '<li class="empty">(chưa có lịch sử)</li>'

    prompt_text = _read_text_file(article.get("prompt_path"))
    markdown_text = _read_text_file(article.get("markdown_path"))

    prompt_section = (
        f'<pre class="code-block" id="promptText">{html.escape(prompt_text)}</pre>'
        if prompt_text is not None else
        f'<p class="empty">(chưa có — dùng <code>editorial prompt {html.escape(short_id)}</code> để sinh)</p>'
    )
    markdown_section = (
        f'<pre class="code-block" id="markdownText">{html.escape(markdown_text)}</pre>'
        if markdown_text is not None else
        f'<p class="empty">(chưa có — dùng <code>editorial markdown {html.escape(short_id)}</code> để sinh)</p>'
    )

    tags = ", ".join(event.get("suggested_tags") or []) or "(không có)"
    internal_links = ", ".join(
        assignment.get("suggested_internal_links") or event.get("related_artists") or []
    ) or "(không có)"

    body = f"""
    <section class="grid-2">
      <div class="card">
        <h2>Metadata</h2>
        <dl class="fields">
          <div><dt>Title</dt><dd>{html.escape(event["title"])}</dd></div>
          <div><dt>Artist</dt><dd>{html.escape(event["artist"])}</dd></div>
          <div><dt>Series</dt><dd>{html.escape(event.get("suggested_series") or "-")}</dd></div>
          <div><dt>Story Type</dt><dd>{html.escape(story.get("story_type", "-"))}</dd></div>
          <div><dt>Priority</dt><dd>{story.get("priority_score", 0)}</dd></div>
          <div><dt>Status</dt><dd>{html.escape(article["status"])}</dd></div>
          <div><dt>Assigned Editor</dt><dd>{html.escape(article.get("assigned_editor") or "(chưa gán)")}</dd></div>
          <div><dt>Created</dt><dd>{html.escape(article.get("created", ""))}</dd></div>
          <div><dt>Updated</dt><dd>{html.escape(article.get("updated", ""))}</dd></div>
          <div><dt>Published</dt><dd>{html.escape(article.get("published") or "(chưa xuất bản)")}</dd></div>
        </dl>
        <h2>Tags</h2><p>{html.escape(tags)}</p>
        <h2>Internal Linking</h2><p>{html.escape(internal_links)}</p>
      </div>
      <div class="card">
        <h2>History</h2>
        <ul class="list timeline">{history_rows}</ul>
      </div>
    </section>
    <section class="card">
      <h2>Prompt</h2>
      {prompt_section}
    </section>
    <section class="card" id="markdown-section">
      <h2>Markdown</h2>
      {markdown_section}
    </section>
    <section class="actions">
      <button class="btn" id="copyPromptBtn" data-target="promptText" {"disabled" if prompt_text is None else ""}>Copy Prompt</button>
      <a class="btn" href="#markdown-section">Open Markdown</a>
      <button class="btn btn--cli" data-cli="editorial export {html.escape(short_id)}">Export</button>
      <button class="btn btn--cli" data-cli="editorial archive {html.escape(short_id)}">Archive</button>
    </section>
    """
    content = _fill(_read_template("article.html"), {"BODY": body})
    return render_page("article", f"Article — {event['title']}", content)


# ----------------------------------------------------------------------
# Worker page
# ----------------------------------------------------------------------

def build_worker_page() -> str:
    runs = load_worker_runs()
    worker_config = load_worker_config()  # Phase 6, reused unchanged

    if not runs:
        status_html = '<p class="empty">Chưa có lần chạy nào — dùng <code>editorial worker run</code>.</p>'
    else:
        last = runs[-1]
        run_objs = [_run_dict_to_runlog(r) for r in runs]
        health = HealthEngine().compute(run_objs)  # Phase 6, reused unchanged
        scheduler_mode = worker_config.get("schedule", {}).get("mode", "manual")
        scheduler = Scheduler(mode=scheduler_mode)  # Phase 6, reused unchanged
        due_now = scheduler.is_due(last.get("started_at"))

        duration = f'{last["duration_seconds"]:.3f}s' if last.get("duration_seconds") is not None else "(n/a)"

        status_html = f"""
        <section class="tiles">
          {_stat_tile("Worker Status", health.status)}
          {_stat_tile("Processed Events", health.last_events_processed)}
          {_stat_tile("Schedule Mode", scheduler_mode)}
          {_stat_tile("Due Now", "Yes" if due_now else "No")}
        </section>
        <section class="card">
          <h2>Last Run</h2>
          <dl class="fields">
            <div><dt>Run ID</dt><dd>{html.escape(last["run_id"])}</dd></div>
            <div><dt>Started</dt><dd>{html.escape(last["started_at"])}</dd></div>
            <div><dt>Finished</dt><dd>{html.escape(last.get("finished_at") or "(chưa xong)")}</dd></div>
            <div><dt>Duration</dt><dd>{duration}</dd></div>
            <div><dt>Last Success</dt><dd>{html.escape(health.last_success_at or "(chưa có)")}</dd></div>
            <div><dt>Last Failure</dt><dd>{html.escape(health.last_failure_at or "(chưa có)")}</dd></div>
          </dl>
        </section>
        """

    body = status_html + """
    <section class="actions">
      <button class="btn btn--cli" data-cli="editorial worker run">Run Now</button>
      <button class="btn" onclick="location.reload()">Refresh</button>
      <button class="btn btn--cli" data-cli="editorial worker health">Health Check</button>
    </section>
    """
    content = _fill(_read_template("worker.html"), {"BODY": body})
    return render_page("worker", "Worker", content)


# ----------------------------------------------------------------------
# History pages (list + detail)
# ----------------------------------------------------------------------

def build_history_list_page() -> str:
    articles = load_articles()
    if not articles:
        body = '<p class="empty">Chưa có Article nào.</p>'
        content = _fill(_read_template("history.html"), {"BODY": body})
        return render_page("history", "History", content)

    rows = "".join(
        f'<tr class="clickable-row" data-href="/history/{html.escape(a["story"]["event"]["id"])}">'
        f'<td>{html.escape(a["story"]["event"]["id"][:8])}</td>'
        f'<td>{html.escape(a["story"]["event"]["title"])}</td>'
        f'<td>{html.escape(a["status"])}</td>'
        f'</tr>'
        for a in articles
    )
    body = f"""
    <table class="table table--clickable">
      <thead><tr><th>ID</th><th>Title</th><th>Status</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    """
    content = _fill(_read_template("history.html"), {"BODY": body})
    return render_page("history", "History", content)


def build_history_detail_page(article_id: str) -> str:
    articles = load_articles()
    article = _find_article(articles, article_id)
    if article is None:
        body = (
            f'<p class="empty">Không tìm thấy Article với id: {html.escape(article_id)}. '
            f'<a href="/history">Quay lại danh sách</a>.</p>'
        )
        content = _fill(_read_template("history.html"), {"BODY": body})
        return render_page("history", "History", content)

    items = "".join(
        '<li class="timeline__item"><span class="timeline__dot"></span>'
        f'<div><strong>{html.escape(h["label"])}</strong><br>'
        f'<span class="muted">{html.escape(h["timestamp"])}</span>'
        + (f'<br><span class="muted">{html.escape(h["note"])}</span>' if h.get("note") else "")
        + "</div></li>"
        for h in article.get("history", [])
    ) or '<li class="empty">(chưa có lịch sử)</li>'

    body = f"""
    <h2>{html.escape(article["story"]["event"]["title"])}</h2>
    <ul class="timeline">{items}</ul>
    """
    content = _fill(_read_template("history.html"), {"BODY": body})
    return render_page("history", "History", content)


# ----------------------------------------------------------------------
# Settings page (readonly)
# ----------------------------------------------------------------------

_SETTINGS_FILES = [
    ("worker.yaml", os.path.join(WORKERS_DIR, "worker.yaml")),
    ("confidence.yaml (confidence_weights.yaml)", os.path.join(CONFIG_DIR, "confidence_weights.yaml")),
    ("sources.yaml", os.path.join(CONFIG_DIR, "sources.yaml")),
    ("series.yaml (issue_balance.yaml)", os.path.join(CONFIG_DIR, "issue_balance.yaml")),
]


def build_settings_page() -> str:
    sections = []
    for label, path in _SETTINGS_FILES:
        text = _read_text_file(path)
        block = html.escape(text) if text is not None else "(không tìm thấy file)"
        sections.append(
            f'<section class="card"><h2>{html.escape(label)}</h2><pre class="code-block">{block}</pre></section>'
        )
    body = "".join(sections)
    content = _fill(_read_template("settings.html"), {"BODY": body})
    return render_page("settings", "Settings", content)


# ----------------------------------------------------------------------
# HTTP server — stdlib only, no new dependency, no framework.
# ----------------------------------------------------------------------

class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "EditorialDashboard/1.0"

    def log_message(self, format, *args):  # noqa: A002 - matches BaseHTTPRequestHandler signature
        pass

    def do_GET(self):  # noqa: N802 - required name by http.server
        path = urllib.parse.urlparse(self.path).path

        if path.startswith("/static/"):
            self._serve_static(path[len("/static/"):])
            return

        try:
            if path in ("/", "/dashboard"):
                out = build_dashboard_page()
            elif path == "/queue":
                out = build_queue_page()
            elif path == "/article":
                out = build_article_list_page()
            elif path.startswith("/article/"):
                out = build_article_detail_page(urllib.parse.unquote(path[len("/article/"):]))
            elif path == "/worker":
                out = build_worker_page()
            elif path == "/history":
                out = build_history_list_page()
            elif path.startswith("/history/"):
                out = build_history_detail_page(urllib.parse.unquote(path[len("/history/"):]))
            elif path == "/settings":
                out = build_settings_page()
            else:
                self._send(404, "Not found", "text/plain; charset=utf-8")
                return
        except Exception as exc:  # pragma: no cover - defensive, presentation layer must not crash the server
            self._send(500, f"Lỗi hiển thị: {exc}", "text/plain; charset=utf-8")
            return

        self._send(200, out, "text/html; charset=utf-8")

    def _serve_static(self, rel_path: str) -> None:
        rel_path = urllib.parse.unquote(rel_path).lstrip("/")
        normalized = os.path.normpath(rel_path)
        if normalized.startswith("..") or os.path.isabs(normalized):
            self._send(403, "Forbidden", "text/plain; charset=utf-8")
            return

        full_path = os.path.abspath(os.path.join(STATIC_DIR, normalized))
        if os.path.commonpath([full_path, STATIC_DIR]) != STATIC_DIR:
            self._send(403, "Forbidden", "text/plain; charset=utf-8")
            return
        if not os.path.isfile(full_path):
            self._send(404, "Not found", "text/plain; charset=utf-8")
            return

        content_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        with open(full_path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send(self, status: int, content: str, content_type: str) -> None:
        data = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def make_server(host: str = "127.0.0.1", port: int = 8877) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), DashboardHandler)
