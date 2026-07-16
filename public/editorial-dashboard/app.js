/**
 * Editorial OS — Worker Dashboard (static, framework-free).
 *
 * Talks only to the deployed Cloudflare Worker's frozen HTTP API
 * (GET /health, GET /dashboard, GET /queue, GET /history, POST /run) via
 * plain fetch(). No build step, no framework, no external library, no
 * CDN — everything below is vanilla DOM + fetch. Nothing here calls any
 * route beyond those 5; System Metrics, the Queue cards, Today's Top
 * Story, and the Activity Log are all *client-side* views composed
 * from that same data — no new backend surface.
 */
(function () {
  "use strict";

  var WORKER_BASE_URL = "https://tnc-editorial-os.lamaronthebeatz.workers.dev";
  var AUTO_REFRESH_MS = 30000;
  var CRON_INTERVAL_MS = 30 * 60 * 1000; // matches wrangler.toml's cron ("*/30 * * * *"), read-only
  var CRON_GRACE_MS = 5 * 60 * 1000; // tolerance before calling a run "delayed"

  var STORY_TYPE_LABELS = {
    breaking: "Breaking",
    release: "Release",
    feature: "Feature",
    interview: "Interview",
    review: "Review",
    profile: "Profile",
    timeline: "Timeline",
    discovery: "Discovery",
    community: "Community",
    editorial: "Editorial",
  };

  var HEALTH_STATUS_LABELS = {
    ok: "OK",
    failed: "Failed",
    never_run: "Never run",
    unknown: "Unknown",
  };

  // ---- DOM refs ----
  var refreshBtn = document.getElementById("refreshBtn");
  var runBtn = document.getElementById("runBtn");
  var globalLoading = document.getElementById("globalLoading");
  var progressBar = document.getElementById("progressBar");
  var lastRefreshedEl = document.getElementById("lastRefreshed");
  var workerEndpointEl = document.getElementById("workerEndpoint");
  var workerStatusDot = document.getElementById("workerStatusDot");
  var workerStatusText = document.getElementById("workerStatusText");
  var currentTimeEl = document.getElementById("currentTime");
  var toastStack = document.getElementById("toastStack");
  var dashboardViewError = document.getElementById("dashboard-view-error");

  var metricWorkerStatus = document.getElementById("metric-worker-status");
  var metricWorkerSub = document.getElementById("metric-worker-sub");
  var metricApiHealth = document.getElementById("metric-api-health");
  var metricApiSub = document.getElementById("metric-api-sub");
  var metricQueueCount = document.getElementById("metric-queue-count");
  var metricQueueSub = document.getElementById("metric-queue-sub");
  var metricStoriesToday = document.getElementById("metric-stories-today");
  var metricStoriesSub = document.getElementById("metric-stories-sub");
  var metricLastRun = document.getElementById("metric-last-run");
  var metricLastRunSub = document.getElementById("metric-last-run-sub");
  var metricCronStatus = document.getElementById("metric-cron-status");
  var metricCronSub = document.getElementById("metric-cron-sub");

  var queueCountBadge = document.getElementById("queue-count-badge");
  var queueList = document.getElementById("queue-list");
  var queueEmpty = document.getElementById("queue-empty");

  var topStoryBody = document.getElementById("top-story-body");

  var activityTimeline = document.getElementById("activity-timeline");
  var activityEmpty = document.getElementById("activity-empty");

  var autoRefreshTimer = null;
  var clockTimer = null;

  workerEndpointEl.textContent = WORKER_BASE_URL;

  // ---- small utilities ----

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function formatTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatShortTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  function isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  function showToast(message, kind) {
    var toast = document.createElement("div");
    toast.className = "toast " + (kind === "error" ? "toast--error" : "toast--success");
    toast.textContent = message;
    toastStack.appendChild(toast);
    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  function setProgress(active) {
    if (active) {
      progressBar.classList.add("is-active");
      progressBar.style.width = "70%";
    } else {
      progressBar.style.width = "100%";
      window.setTimeout(function () {
        progressBar.classList.remove("is-active");
        progressBar.style.width = "0%";
      }, 200);
    }
  }

  function setGlobalLoading(isLoading) {
    globalLoading.hidden = !isLoading;
    refreshBtn.disabled = isLoading;
    runBtn.disabled = isLoading;
  }

  function updateWorkerStatusBadge(healthData, healthFailed) {
    var status = healthFailed ? "unknown" : (healthData && healthData.status) || "unknown";
    workerStatusDot.className = "status-dot status-dot--" + status;
    var labelMap = {
      ok: "Worker Status: OK",
      failed: "Worker Status: FAILED",
      never_run: "Worker Status: chưa chạy lần nào",
      unknown: "Worker Status: không xác định",
    };
    workerStatusText.textContent = labelMap[status] || labelMap.unknown;
  }

  function updateClock() {
    currentTimeEl.textContent = new Date().toLocaleTimeString("vi-VN");
  }

  function fetchJson(path, options) {
    return fetch(WORKER_BASE_URL + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (!response.ok && !(response.status === 404 && path === "/dashboard")) {
            var message = (body && body.error) || "HTTP " + response.status;
            throw new Error(message);
          }
          return { response: response, body: body, ok: response.ok || (response.status === 404 && path === "/dashboard") };
        });
    });
  }

  // ---- rendering: System Metrics ----

  function renderWorkerStatusMetric(health, healthFailed) {
    var status = healthFailed ? "unknown" : (health && health.status) || "unknown";
    metricWorkerStatus.innerHTML =
      (HEALTH_STATUS_LABELS[status] || "Unknown") +
      ' <span class="pill ' +
      (status === "ok" ? "pill--success" : status === "failed" ? "pill--error" : "pill--neutral") +
      '">' +
      escapeHtml(status) +
      "</span>";
    metricWorkerSub.textContent =
      health && health.lastDurationSeconds != null ? "Last run " + health.lastDurationSeconds.toFixed(1) + "s" : "Chưa có lần chạy nào.";
  }

  function renderApiHealthMetric(okCount, totalCount) {
    var allOk = okCount === totalCount;
    var pillClass = allOk ? "pill--success" : okCount === 0 ? "pill--error" : "pill--warning";
    metricApiHealth.innerHTML = (allOk ? "Reachable" : "Degraded") + ' <span class="pill ' + pillClass + '">' + okCount + "/" + totalCount + "</span>";
    metricApiSub.textContent = okCount + "/" + totalCount + " endpoint" + (totalCount === 1 ? "" : "s") + " OK";
  }

  function renderQueueCountMetric(queue) {
    var merged = queue.filter(function (s) {
      return s.decision === "merge";
    }).length;
    metricQueueCount.textContent = String(queue.length);
    metricQueueSub.textContent = merged > 0 ? merged + " merged as duplicates" : "Không có duplicate.";
  }

  function renderStoriesTodayMetric(history) {
    var todayCount = history.filter(function (a) {
      return isToday(a.created);
    }).length;
    metricStoriesToday.textContent = String(todayCount);
    metricStoriesSub.textContent = "trong " + history.length + " tổng số.";
  }

  function renderLastRunMetric(health) {
    metricLastRun.textContent = formatShortTime(health && health.lastRunAt);
    metricLastRunSub.textContent = health && health.lastRunAt ? new Date(health.lastRunAt).toLocaleDateString("vi-VN") : "Chưa chạy lần nào.";
  }

  function renderCronStatusMetric(health) {
    var lastRunAt = health && health.lastRunAt;
    if (!lastRunAt) {
      metricCronStatus.innerHTML = 'Unknown <span class="pill pill--neutral">estimated</span>';
      metricCronSub.textContent = "Chưa có lần chạy nào để ước tính.";
      return;
    }
    var elapsed = Date.now() - new Date(lastRunAt).getTime();
    var onSchedule = elapsed <= CRON_INTERVAL_MS + CRON_GRACE_MS;
    metricCronStatus.innerHTML = onSchedule
      ? 'On Schedule <span class="pill pill--success">estimated</span>'
      : 'Delayed <span class="pill pill--warning">estimated</span>';
    metricCronSub.textContent = "Ước tính từ lịch 30 phút — không phải Cloudflare Cron telemetry trực tiếp.";
  }

  // ---- rendering: Queue (CMS-style cards, not raw JSON) ----

  function sourceName(event) {
    if (event.primarySource && event.primarySource.name) return event.primarySource.name;
    if (event.sources && event.sources.length) return event.sources[0].name;
    return "Không rõ nguồn";
  }

  function collectedTime(event) {
    if (event.sources && event.sources.length && event.sources[0].retrievedAt) return event.sources[0].retrievedAt;
    return event.publishedAt;
  }

  function storyCardHtml(story, index) {
    var event = story.event;
    var isDuplicate = story.decision === "merge";
    var categoryLabel = STORY_TYPE_LABELS[story.storyType] || story.storyType;
    var sourcesHtml = (event.sources || [])
      .map(function (s) {
        var label = escapeHtml(s.name) + (s.tier ? " (" + escapeHtml(s.tier) + ")" : "");
        return s.url ? '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + label + "</a>" : "<span>" + label + "</span>";
      })
      .join("");

    return (
      '<article class="story-card" data-index="' +
      index +
      '">' +
      '<div class="story-card__top">' +
      "<div>" +
      '<div class="story-card__title">' +
      escapeHtml(event.title) +
      "</div>" +
      '<div class="story-card__source">' +
      escapeHtml(sourceName(event)) +
      "</div>" +
      "</div>" +
      '<div class="story-card__priority">' +
      story.priorityScore +
      "</div>" +
      "</div>" +
      '<div class="story-card__meta">' +
      '<span class="pill pill--accent">' +
      escapeHtml(categoryLabel) +
      "</span>" +
      '<span class="pill ' +
      (isDuplicate ? "pill--warning" : "pill--neutral") +
      '">' +
      (isDuplicate ? "Duplicate" : "No duplicate") +
      "</span>" +
      '<span class="story-card__time">Collected ' +
      formatShortTime(collectedTime(event)) +
      "</span>" +
      "</div>" +
      '<div class="story-card__actions">' +
      '<button class="btn btn--ghost js-open-story" type="button" data-index="' +
      index +
      '">Open</button>' +
      "</div>" +
      '<div class="story-card__detail" id="story-detail-' +
      index +
      '" hidden>' +
      "<p>" +
      escapeHtml(event.description || "Không có mô tả.") +
      "</p>" +
      '<div class="story-card__detail-sources">' +
      sourcesHtml +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderQueue(queue) {
    queueCountBadge.textContent = queue.length + " stories";
    renderQueueCountMetric(queue);

    if (queue.length === 0) {
      queueList.innerHTML = "";
      queueEmpty.hidden = false;
      return;
    }
    queueEmpty.hidden = true;
    queueList.innerHTML = queue.map(storyCardHtml).join("");
  }

  queueList.addEventListener("click", function (event) {
    var btn = event.target.closest(".js-open-story");
    if (!btn) return;
    var detail = document.getElementById("story-detail-" + btn.getAttribute("data-index"));
    if (!detail) return;
    detail.hidden = !detail.hidden;
    btn.textContent = detail.hidden ? "Open" : "Close";
  });

  // ---- rendering: Today's Top Story ----

  function renderTopStory(dashboardData, queue) {
    var topTitle = dashboardData && dashboardData.topStory;
    if (!topTitle) {
      topStoryBody.innerHTML = '<p class="empty">Chưa có top story.</p>';
      return;
    }
    var story = queue.find(function (s) {
      return s.event.title === topTitle;
    });
    if (!story) {
      topStoryBody.innerHTML =
        '<div class="top-story__title">' + escapeHtml(topTitle) + "</div>" + '<p class="empty">Story này không còn trong Queue hiện tại.</p>';
      return;
    }
    var event = story.event;
    var isDuplicate = story.decision === "merge";
    topStoryBody.innerHTML =
      '<div class="top-story__cover">No cover image</div>' +
      '<div class="top-story__title">' +
      escapeHtml(event.title) +
      "</div>" +
      '<div class="top-story__grid">' +
      '<div><div class="kv__label">Source</div><div class="kv__value">' +
      escapeHtml(sourceName(event)) +
      "</div></div>" +
      '<div><div class="kv__label">Priority</div><div class="kv__value kv__value--mono">' +
      story.priorityScore +
      "</div></div>" +
      '<div><div class="kv__label">Suggested Series</div><div class="kv__value">' +
      escapeHtml(event.suggestedSeries || "—") +
      "</div></div>" +
      '<div><div class="kv__label">Collected</div><div class="kv__value kv__value--mono">' +
      formatTime(collectedTime(event)) +
      "</div></div>" +
      '<div><div class="kv__label">Duplicate</div><div class="kv__value"><span class="pill ' +
      (isDuplicate ? "pill--warning" : "pill--neutral") +
      '">' +
      (isDuplicate ? "Duplicate" : "Single source") +
      "</span></div></div>" +
      "</div>";
  }

  // ---- rendering: Activity Log (operational timeline, derived from
  // existing /dashboard.newsCollector + /health fields — no new
  // backend data, reflects only the latest run's snapshot) ----

  function renderActivityLog(dashboardData, health) {
    var nc = dashboardData && dashboardData.newsCollector;
    var rows = [];
    var runTime = (nc && nc.lastCrawlAt) || (health && health.lastRunAt);

    if (nc) {
      rows.push({ time: nc.lastCrawlAt, dot: "", pill: "pill--neutral", pillText: "collect", text: "Collected <strong>" + nc.collected + " events</strong>" });
      rows.push({
        time: nc.lastCrawlAt,
        dot: "warning",
        pill: "pill--warning",
        pillText: "dedupe",
        text: "Removed <strong>" + nc.duplicatesRemoved + " duplicates</strong>",
      });
      rows.push({
        time: nc.lastCrawlAt,
        dot: "accent",
        pill: "pill--accent",
        pillText: "queue",
        text: "Generated queue — <strong>" + nc.accepted + " stories</strong>",
      });
    }
    if (health && health.lastRunAt) {
      var failed = health.status === "failed";
      rows.push({
        time: health.lastRunAt,
        dot: failed ? "" : "success",
        pill: failed ? "pill--error" : "pill--success",
        pillText: failed ? "error" : "done",
        text: "Worker finished — <strong>" + (health.lastEventsProcessed || 0) + " events processed</strong>",
      });
    }

    if (rows.length === 0) {
      activityTimeline.innerHTML = "";
      activityEmpty.hidden = false;
      return;
    }
    activityEmpty.hidden = true;
    activityTimeline.innerHTML = rows
      .map(function (row) {
        return (
          '<div class="timeline__row">' +
          '<span class="timeline__time">' +
          formatTime(row.time) +
          "</span>" +
          '<span class="timeline__dot' +
          (row.dot ? " timeline__dot--" + row.dot : "") +
          '"></span>' +
          '<span class="timeline__action">' +
          row.text +
          "</span>" +
          '<span class="pill ' +
          row.pill +
          '">' +
          row.pillText +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    void runTime; // kept for potential future "last run at" summary line
  }

  // ---- refresh / run ----

  function refreshAll() {
    setGlobalLoading(true);
    setProgress(true);
    dashboardViewError.hidden = true;

    var healthResult = null;
    var healthFailed = false;
    var okCount = 0;
    var totalCount = 4;
    var dashboardData = null;
    var queue = [];
    var history = [];
    var errors = [];

    var healthTask = fetchJson("/health").then(
      function (result) {
        healthResult = result.body;
        okCount += 1;
      },
      function (err) {
        healthFailed = true;
        errors.push("health: " + err.message);
      },
    );

    var dashboardTask = fetchJson("/dashboard").then(
      function (result) {
        dashboardData = result.body;
        okCount += 1;
      },
      function (err) {
        errors.push("dashboard: " + err.message);
      },
    );

    var queueTask = fetchJson("/queue").then(
      function (result) {
        queue = result.body || [];
        okCount += 1;
      },
      function (err) {
        errors.push("queue: " + err.message);
      },
    );

    var historyTask = fetchJson("/history").then(
      function (result) {
        history = result.body || [];
        okCount += 1;
      },
      function (err) {
        errors.push("history: " + err.message);
      },
    );

    return Promise.allSettled([healthTask, dashboardTask, queueTask, historyTask]).then(function () {
      updateWorkerStatusBadge(healthResult, healthFailed);
      renderWorkerStatusMetric(healthResult, healthFailed);
      renderApiHealthMetric(okCount, totalCount);
      renderStoriesTodayMetric(history);
      renderLastRunMetric(healthResult);
      renderCronStatusMetric(healthResult);
      renderQueue(queue);
      renderTopStory(dashboardData, queue);
      renderActivityLog(dashboardData, healthResult);

      lastRefreshedEl.textContent = "Lần refresh cuối: " + new Date().toLocaleString("vi-VN");
      setGlobalLoading(false);
      setProgress(false);

      if (errors.length === 0) {
        showToast("Đã refresh xong dashboard.", "success");
      } else {
        dashboardViewError.hidden = false;
        dashboardViewError.textContent = "Một số endpoint không tải được: " + errors.join("; ");
        showToast("Một số endpoint không tải được.", "error");
      }
    });
  }

  function runWorker() {
    setGlobalLoading(true);
    setProgress(true);
    runBtn.textContent = "Đang chạy…";

    return fetchJson("/run", { method: "POST" })
      .then(function (result) {
        showToast("Worker đã chạy xong — events processed: " + (result.body && result.body.eventsProcessed), "success");
        return refreshAll();
      })
      .catch(function (err) {
        showToast("Chạy Worker thất bại: " + (err.message || "lỗi không xác định"), "error");
        setGlobalLoading(false);
        setProgress(false);
      })
      .then(function () {
        runBtn.textContent = "Run Worker";
      });
  }

  function resetAutoRefresh() {
    if (autoRefreshTimer !== null) {
      window.clearInterval(autoRefreshTimer);
    }
    autoRefreshTimer = window.setInterval(refreshAll, AUTO_REFRESH_MS);
  }

  refreshBtn.addEventListener("click", function () {
    refreshAll().then(resetAutoRefresh);
  });

  runBtn.addEventListener("click", function () {
    runWorker().then(resetAutoRefresh);
  });

  document.addEventListener("DOMContentLoaded", function () {
    updateClock();
    clockTimer = window.setInterval(updateClock, 1000);
    refreshAll().then(resetAutoRefresh);
  });
})();
