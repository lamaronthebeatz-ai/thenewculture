/* Editorial Dashboard (Phase 7) — vanilla JS only, no framework.
 *
 * Every handler here is either:
 *   (a) purely navigational/visual (sidebar toggle, clickable rows,
 *       toast), or
 *   (b) a clipboard copy of text ALREADY rendered on the page
 *       (the CLI command on a `.btn--cli` button, or the prompt text
 *       already read from disk by router.py).
 * Nothing here calls back to a server endpoint that mutates Editorial
 * OS state — this dashboard is a Presentation Layer only, so any real
 * action (generating a prompt, running the Worker, archiving an
 * Article, ...) is left for the editor to run themselves via the CLI,
 * matching the exact command shown.
 */
(function () {
  "use strict";

  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("toast--visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(function () {
      toast.classList.remove("toast--visible");
    }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* clipboard unavailable — command is still visible in the button/page */
    }
    document.body.removeChild(textarea);
  }

  function initSidebarToggle() {
    var toggle = document.getElementById("sidebarToggle");
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    if (!toggle || !sidebar || !overlay) return;

    function close() {
      sidebar.classList.remove("is-open");
      overlay.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function open() {
      sidebar.classList.add("is-open");
      overlay.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function () {
      if (sidebar.classList.contains("is-open")) close();
      else open();
    });
    overlay.addEventListener("click", close);
  }

  function initCliButtons() {
    var buttons = document.querySelectorAll(".btn--cli[data-cli]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var command = btn.getAttribute("data-cli");
        copyText(command);
        showToast("Đã copy lệnh: " + command);
      });
    });
  }

  function initCopyPromptButton() {
    var btn = document.getElementById("copyPromptBtn");
    if (!btn || btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", function () {
      var targetId = btn.getAttribute("data-target");
      var target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      copyText(target.textContent);
      showToast("Đã copy Prompt vào clipboard.");
    });
  }

  function initClickableRows() {
    var rows = document.querySelectorAll(".clickable-row[data-href]");
    rows.forEach(function (row) {
      row.addEventListener("click", function () {
        window.location.href = row.getAttribute("data-href");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initSidebarToggle();
    initCliButtons();
    initCopyPromptButton();
    initClickableRows();
  });
})();
