/**
 * Editorial OS — Worker Dashboard (static, framework-free).
 *
 * Talks only to the deployed Cloudflare Worker's HTTP API
 * (GET /health, GET /dashboard, GET /queue, GET /history, POST /run) via
 * plain fetch(). No build step, no framework, no external library, no
 * CDN — everything below is vanilla DOM + fetch.
 */
(function () {
  "use strict";

  var WORKER_BASE_URL = "https://tnc-editorial-os.lamaronthebeatz.workers.dev";
  var AUTO_REFRESH_MS = 30000;

  var PANELS = [
    { key: "health", path: "/health" },
    { key: "dashboard", path: "/dashboard" },
    { key: "queue", path: "/queue" },
    { key: "history", path: "/history" },
  ];

  var refreshBtn = document.getElementById("refreshBtn");
  var runBtn = document.getElementById("runBtn");
  var globalLoading = document.getElementById("globalLoading");
  var progressBar = document.getElementById("progressBar");
  var lastRefreshedEl = document.getElementById("lastRefreshed");
  var workerEndpointEl = document.getElementById("workerEndpoint");
  var workerStatusDot = document.getElementById("workerStatusDot");
  var workerStatusText = document.getElementById("workerStatusText");
  var toastStack = document.getElementById("toastStack");

  var autoRefreshTimer = null;

  workerEndpointEl.textContent = WORKER_BASE_URL;

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

  function prettyPrint(data) {
    try {
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return String(data);
    }
  }

  function renderPanelSuccess(key, data) {
    var body = document.getElementById(key + "-body");
    var errorBox = document.getElementById(key + "-error");
    var badge = document.getElementById(key + "-badge");
    errorBox.hidden = true;
    errorBox.textContent = "";
    body.textContent = prettyPrint(data);
    badge.textContent = "OK";
  }

  function renderPanelError(key, message) {
    var body = document.getElementById(key + "-body");
    var errorBox = document.getElementById(key + "-error");
    var badge = document.getElementById(key + "-badge");
    errorBox.hidden = false;
    errorBox.textContent = message;
    badge.textContent = "LỖI";
    body.textContent = "(không tải được dữ liệu)";
  }

  function renderPanelLoading(key) {
    var badge = document.getElementById(key + "-badge");
    badge.textContent = "Đang tải…";
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

  function fetchJson(path, options) {
    return fetch(WORKER_BASE_URL + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (!response.ok && !(response.status === 404 && path === "/dashboard")) {
            var message = (body && body.error) || ("HTTP " + response.status);
            throw new Error(message);
          }
          return { response: response, body: body };
        });
    });
  }

  function refreshAll() {
    setGlobalLoading(true);
    setProgress(true);
    PANELS.forEach(function (panel) {
      renderPanelLoading(panel.key);
    });

    var healthResult = null;
    var healthFailed = false;

    var tasks = PANELS.map(function (panel) {
      return fetchJson(panel.path)
        .then(function (result) {
          renderPanelSuccess(panel.key, result.body);
          if (panel.key === "health") healthResult = result.body;
        })
        .catch(function (err) {
          renderPanelError(panel.key, err.message || "Không thể tải dữ liệu.");
          if (panel.key === "health") healthFailed = true;
        });
    });

    return Promise.allSettled(tasks).then(function (results) {
      updateWorkerStatusBadge(healthResult, healthFailed);
      lastRefreshedEl.textContent = "Lần refresh cuối: " + new Date().toLocaleString("vi-VN");
      setGlobalLoading(false);
      setProgress(false);

      var anyFailed = results.some(function (r) {
        return r.status === "rejected";
      });
      if (!anyFailed) {
        showToast("Đã refresh xong tất cả panel.", "success");
      } else {
        showToast("Một số panel không tải được — xem chi tiết trong từng panel.", "error");
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
    refreshAll().then(resetAutoRefresh);
  });
})();
