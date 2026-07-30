import { useCallback, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorage } from "../lib/useLocalStorage";
import { NAV_GROUPS } from "./navConfig";

// Bug fix (kế thừa từ Dashboard cũ): Site Settings/Menu/Footer/Hero/Ads/
// Promotion/Announcement không có Database Webhook riêng như Articles, nên
// sửa xong ở các module này không tự kích hoạt build lại site — phải chờ
// lịch cron (mỗi 15 phút) hoặc bấm nút này để build ngay. Xem
// supabase/functions/trigger-rebuild/.
function RebuildButton({ collapsed }) {
  const [state, setState] = useState("idle"); // idle | loading | ok | error
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    setMessage("");
    const { data, error } = await supabase.functions.invoke("trigger-rebuild", { method: "POST" });
    if (error) {
      console.error("[trigger-rebuild] invoke thất bại:", error.name, error.message, error);
      setState("error");
      setMessage(error.message || "Không kích hoạt được.");
      return;
    }
    if (data?.ok && data?.triggered) {
      setState("ok");
      setMessage("Đã kích hoạt build. Website sẽ cập nhật sau khoảng 1–2 phút.");
    } else {
      setState("error");
      setMessage(data?.reason || "Không kích hoạt được.");
    }
  }

  if (collapsed) {
    return (
      <div className="sidebar__rebuild sidebar__rebuild--collapsed">
        <button
          type="button"
          className="tncos-btn tncos-btn--ghost tncos-btn--icon tncos-btn--sm"
          onClick={handleClick}
          disabled={state === "loading"}
          title="Rebuild site now"
          aria-label="Rebuild site now"
        >
          ⟳
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar__rebuild">
      <button type="button" className="tncos-btn tncos-btn--ghost tncos-btn--sm" onClick={handleClick} disabled={state === "loading"}>
        {state === "loading" ? "Đang kích hoạt…" : "Rebuild site now"}
      </button>
      {message && <p className={state === "error" ? "field-error" : "muted small"}>{message}</p>}
    </div>
  );
}

const MIN_WIDTH = 200; // phải khớp --sidebar-width-min ở tokens.css
const MAX_WIDTH = 360; // phải khớp --sidebar-width-max ở tokens.css

export default function Sidebar({ mobileOpen = false }) {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useLocalStorage("tncos.sidebar.collapsed", false);
  const [width, setWidth] = useLocalStorage("tncos.sidebar.width", 240);
  const [favorites, setFavorites] = useLocalStorage("tncos.favorites", []);
  const [recent] = useLocalStorage("tncos.recent", []);
  const resizing = useRef(false);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((g) => g.items.length > 0);

  const isFavorite = useCallback((to) => favorites.some((f) => f.to === to), [favorites]);

  function toggleFavorite(item, e) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => (prev.some((f) => f.to === item.to) ? prev.filter((f) => f.to !== item.to) : [...prev, { to: item.to, label: item.label }]));
  }

  function startResize(e) {
    e.preventDefault();
    resizing.current = true;
    function onMove(ev) {
      if (!resizing.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setWidth(next);
    }
    function onUp() {
      resizing.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const recentNotHome = recent.filter((r) => r.to !== location.pathname).slice(0, 5);

  return (
    <nav
      className={[
        "sidebar",
        collapsed ? "sidebar--collapsed" : "",
        mobileOpen ? "is-open-mobile" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={collapsed ? undefined : { width }}
      aria-label="Điều hướng chính TNCOS"
    >
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          ▣
        </span>
        {!collapsed && <span>TNCOS</span>}
        <button
          type="button"
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <div className="sidebar__scroll">
        {!collapsed && favorites.length > 0 && (
          <div className="sidebar__group">
            <div className="sidebar__group-label">Favorites</div>
            <ul className="sidebar__nav">
              {favorites.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => (isActive ? "sidebar__link is-active" : "sidebar__link")}>
                    <span className="sidebar__link-icon" aria-hidden="true">
                      ★
                    </span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!collapsed && recentNotHome.length > 0 && (
          <div className="sidebar__group">
            <div className="sidebar__group-label">Recent</div>
            <ul className="sidebar__nav">
              {recentNotHome.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className="sidebar__link">
                    <span className="sidebar__link-icon" aria-hidden="true">
                      ◷
                    </span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {visibleGroups.map((group) => (
          <div key={group.key} className="sidebar__group">
            {!collapsed && <div className="sidebar__group-label">{group.label}</div>}
            <ul className="sidebar__nav">
              {group.items.map((item) => (
                <li key={item.to} className="sidebar__item">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => (isActive ? "sidebar__link is-active" : "sidebar__link")}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sidebar__link-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {!collapsed && <span className="sidebar__link-text">{item.label}</span>}
                  </NavLink>
                  {!collapsed && (
                    <button
                      type="button"
                      className={isFavorite(item.to) ? "sidebar__fav-btn is-active" : "sidebar__fav-btn"}
                      onClick={(e) => toggleFavorite(item, e)}
                      aria-label={isFavorite(item.to) ? `Bỏ ghim ${item.label}` : `Ghim ${item.label} vào Favorites`}
                      aria-pressed={isFavorite(item.to)}
                    >
                      ★
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <RebuildButton collapsed={collapsed} />

      {!collapsed && (
        <div
          className="sidebar__resize-handle"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để đổi độ rộng sidebar"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => Math.max(MIN_WIDTH, w - 16));
            if (e.key === "ArrowRight") setWidth((w) => Math.min(MAX_WIDTH, w + 16));
          }}
        />
      )}
    </nav>
  );
}
