/**
 * Editorial OS — Source Manager (Phase 10, static, framework-free).
 *
 * Talks to the deployed Worker's Source Manager API
 * (GET/POST/PUT/DELETE /sources[/:id]) via plain fetch(). Kept in its
 * own file/IIFE so app.js (the existing 4-panel Dashboard view) is
 * completely untouched — this only adds a "Sources" tab alongside it.
 */
(function () {
  "use strict";

  var WORKER_BASE_URL = "https://tnc-editorial-os.lamaronthebeatz.workers.dev";

  var HEALTH_LABELS = {
    healthy: "Healthy",
    disabled: "Disabled",
    not_configured: "Not Configured",
    timeout: "Timeout",
    http_404: "Failed",
    http_error: "Failed",
    config_error: "Failed",
    parsing_error: "Invalid Feed",
    rate_limited: "Rate Limited",
  };

  var sourcesCache = [];
  var healthByPrefix = {}; // recordId -> CollectorHealthStatus string
  var editingUrlField = null; // "youtube" | "rss" | "homepage" | null — which field the URL input writes back to when editing
  var DEFAULT_URL_LABEL = "Website, YouTube Channel, hoặc RSS Feed URL";
  var URL_FIELD_LABELS = {
    youtube: "YouTube Channel URL",
    rss: "RSS/Atom Feed URL",
    homepage: "Website URL",
  };

  /** Which SourceRecord field an Edit-mode URL input should read/write,
   * based on feedType — must match how store.ts/routes.ts key their
   * validation (youtube host check vs. generic feed/HTTP URL check),
   * so an edit never gets misrouted into the wrong field. */
  function urlFieldForSource(source) {
    if (source.feedType === "youtube") return "youtube";
    if (source.feedType === "rss" || source.feedType === "atom") return "rss";
    if (source.feedType === "website") return "homepage";
    if (source.youtube) return "youtube";
    if (source.rss) return "rss";
    return "homepage";
  }

  var tabButtons = document.querySelectorAll(".tab");
  var viewDashboard = document.getElementById("view-dashboard");
  var viewSources = document.getElementById("view-sources");

  var searchInput = document.getElementById("sources-search");
  var filterCategory = document.getElementById("sources-filter-category");
  var filterEnabled = document.getElementById("sources-filter-enabled");
  var sortSelect = document.getElementById("sources-sort");
  var addBtn = document.getElementById("sources-add-btn");
  var loadingEl = document.getElementById("sources-loading");
  var errorEl = document.getElementById("sources-error");
  var tbody = document.getElementById("sources-tbody");
  var emptyEl = document.getElementById("sources-empty");

  var modalOverlay = document.getElementById("source-modal-overlay");
  var modalTitle = document.getElementById("source-modal-title");
  var form = document.getElementById("source-form");
  var formId = document.getElementById("source-form-id");
  var formName = document.getElementById("source-form-name");
  var formType = document.getElementById("source-form-type");
  var formCategory = document.getElementById("source-form-category");
  var formUrlField = document.getElementById("source-form-url-field");
  var formUrl = document.getElementById("source-form-url");
  var formNotes = document.getElementById("source-form-notes");
  var formError = document.getElementById("source-form-error");
  var closeBtn = document.getElementById("source-modal-close");
  var cancelBtn = document.getElementById("source-form-cancel");

  function showTab(name) {
    tabButtons.forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === name);
    });
    viewDashboard.hidden = name !== "dashboard";
    viewSources.hidden = name !== "sources";
    if (name === "sources" && sourcesCache.length === 0) refreshSources();
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      showTab(btn.getAttribute("data-tab"));
    });
  });

  function apiFetch(path, options) {
    return fetch(WORKER_BASE_URL + path, options).then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (body) {
          if (!response.ok) {
            var message = (body && body.error) || "HTTP " + response.status;
            throw new Error(message);
          }
          return body;
        });
    });
  }

  function setLoading(isLoading) {
    loadingEl.hidden = !isLoading;
  }

  function showError(message) {
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function buildHealthMap(dashboard) {
    var map = {};
    var entries = (dashboard && dashboard.newsCollector && dashboard.newsCollector.collectorHealth) || [];
    entries.forEach(function (entry) {
      var sourceId = entry.sourceId || "";
      var recordId = sourceId.replace(/-(rss|youtube)$/, "");
      if (!map[recordId] || entry.status === "healthy") map[recordId] = entry.status;
    });
    return map;
  }

  function refreshSources() {
    setLoading(true);
    showError(null);
    return Promise.all([
      apiFetch("/sources"),
      apiFetch("/dashboard").catch(function () {
        return null;
      }),
    ])
      .then(function (results) {
        sourcesCache = (results[0] && results[0].sources) || [];
        healthByPrefix = buildHealthMap(results[1]);
        renderTable();
      })
      .catch(function (err) {
        showError(err.message || "Không tải được danh sách nguồn.");
      })
      .then(function () {
        setLoading(false);
      });
  }

  function matchesSearch(source, term) {
    if (!term) return true;
    var haystack = (source.id + " " + source.name + " " + (source.notes || "")).toLowerCase();
    return haystack.indexOf(term.toLowerCase()) !== -1;
  }

  function matchesFilters(source) {
    if (filterCategory.value && source.category !== filterCategory.value) return false;
    if (filterEnabled.value === "enabled" && !source.enabled) return false;
    if (filterEnabled.value === "disabled" && source.enabled) return false;
    return true;
  }

  function sortSources(list) {
    var mode = sortSelect.value;
    var sorted = list.slice();
    if (mode === "name-asc") sorted.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (mode === "name-desc") sorted.sort(function (a, b) { return b.name.localeCompare(a.name); });
    else if (mode === "updated-desc") sorted.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
    else if (mode === "health") sorted.sort(function (a, b) { return (healthByPrefix[a.id] || "").localeCompare(healthByPrefix[b.id] || ""); });
    return sorted;
  }

  function healthLabel(sourceId, feedType) {
    if (feedType === "manual" || feedType === "website") return HEALTH_LABELS.not_configured;
    var status = healthByPrefix[sourceId] || "not_configured";
    return HEALTH_LABELS[status] || HEALTH_LABELS.not_configured;
  }

  function healthClass(sourceId, feedType) {
    if (feedType === "manual" || feedType === "website") return "not_configured";
    return healthByPrefix[sourceId] || "not_configured";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function renderTable() {
    var term = searchInput.value.trim();
    var filtered = sourcesCache.filter(function (s) {
      return matchesSearch(s, term) && matchesFilters(s);
    });
    var sorted = sortSources(filtered);

    emptyEl.hidden = sorted.length !== 0;
    tbody.innerHTML = sorted
      .map(function (s) {
        return (
          "<tr data-id=\"" + escapeHtml(s.id) + "\">" +
          "<td>" + escapeHtml(s.name) + "<br><small>" + escapeHtml(s.id) + "</small></td>" +
          "<td>" + escapeHtml(s.type) + "</td>" +
          "<td>" + escapeHtml(s.category) + "</td>" +
          "<td>" + escapeHtml(s.feedType) + "</td>" +
          "<td><span class=\"health-pill health-pill--" + escapeHtml(healthClass(s.id, s.feedType)) + "\">" + escapeHtml(healthLabel(s.id, s.feedType)) + "</span></td>" +
          "<td><label class=\"toggle\"><input type=\"checkbox\" class=\"js-toggle-enabled\" " + (s.enabled ? "checked" : "") + "><span class=\"toggle__track\"></span></label></td>" +
          "<td class=\"row-actions\">" +
          "<button class=\"btn js-edit\" type=\"button\">Edit</button>" +
          "<button class=\"btn btn--danger js-delete\" type=\"button\">Delete</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  tbody.addEventListener("change", function (event) {
    if (!event.target.classList.contains("js-toggle-enabled")) return;
    var row = event.target.closest("tr");
    var id = row.getAttribute("data-id");
    var enabled = event.target.checked;
    apiFetch("/sources/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: enabled }),
    })
      .then(function () {
        return refreshSources();
      })
      .catch(function (err) {
        showError(err.message || "Không thể cập nhật enabled.");
        event.target.checked = !enabled;
      });
  });

  tbody.addEventListener("click", function (event) {
    var row = event.target.closest("tr");
    if (!row) return;
    var id = row.getAttribute("data-id");
    var source = sourcesCache.find(function (s) {
      return s.id === id;
    });
    if (!source) return;

    if (event.target.classList.contains("js-edit")) {
      openModal("edit", source);
    } else if (event.target.classList.contains("js-delete")) {
      if (!window.confirm('Xoá nguồn "' + source.name + '"?')) return;
      apiFetch("/sources/" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () {
          return refreshSources();
        })
        .catch(function (err) {
          showError(err.message || "Không thể xoá nguồn.");
        });
    }
  });

  function openModal(mode, source) {
    form.reset();
    formError.hidden = true;
    if (mode === "edit" && source) {
      modalTitle.textContent = "Edit Source";
      formId.value = source.id;
      formName.value = source.name;
      formType.value = source.type;
      formCategory.value = source.category;
      editingUrlField = urlFieldForSource(source);
      formUrlField.hidden = false;
      formUrlField.querySelector("span").textContent = URL_FIELD_LABELS[editingUrlField];
      formUrl.value = source[editingUrlField] || "";
      formNotes.value = source.notes || "";
    } else {
      modalTitle.textContent = "Add Source";
      formId.value = "";
      editingUrlField = null;
      formUrlField.hidden = false;
      formUrlField.querySelector("span").textContent = DEFAULT_URL_LABEL;
    }
    modalOverlay.hidden = false;
  }

  function closeModal() {
    modalOverlay.hidden = true;
  }

  addBtn.addEventListener("click", function () {
    openModal("add", null);
  });
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function (event) {
    if (event.target === modalOverlay) closeModal();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.hidden = true;

    var id = formId.value;
    var isEdit = Boolean(id);
    var payload = isEdit
      ? { name: formName.value.trim(), type: formType.value, category: formCategory.value, notes: formNotes.value }
      : {
          name: formName.value.trim(),
          type: formType.value,
          category: formCategory.value,
          pastedUrl: formUrl.value.trim(),
          notes: formNotes.value,
        };
    if (isEdit) {
      payload[editingUrlField || "youtube"] = formUrl.value.trim() || null;
    }

    var request = isEdit
      ? apiFetch("/sources/" + encodeURIComponent(id), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : apiFetch("/sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

    request
      .then(function () {
        closeModal();
        return refreshSources();
      })
      .catch(function (err) {
        formError.hidden = false;
        formError.textContent = err.message || "Không thể lưu nguồn.";
      });
  });

  searchInput.addEventListener("input", renderTable);
  filterCategory.addEventListener("change", renderTable);
  filterEnabled.addEventListener("change", renderTable);
  sortSelect.addEventListener("change", renderTable);
})();
