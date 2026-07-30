import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { NAV_GROUPS } from "./navConfig";
import { Drawer } from "../components/ui";

// TNCOS Mobile — Bottom Navigation + fullscreen workspace, one-hand friendly
// (5 mục chạm được bằng ngón cái, "Thêm" mở Drawer đáy chứa toàn bộ IA đầy
// đủ thay vì nhồi hết vào thanh dưới).
export default function MobileNav({ onOpenSearch }) {
  const { hasPermission } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(item.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <nav className="mobile-nav" aria-label="Điều hướng TNCOS (mobile)">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "mobile-nav__item is-active" : "mobile-nav__item")}>
          <span aria-hidden="true">⌂</span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/articles" className={({ isActive }) => (isActive ? "mobile-nav__item is-active" : "mobile-nav__item")}>
          <span aria-hidden="true">▤</span>
          <span>Articles</span>
        </NavLink>
        <button type="button" className="mobile-nav__item" onClick={onOpenSearch}>
          <span aria-hidden="true">⌕</span>
          <span>Search</span>
        </button>
        <NavLink to="/activity-log" className={({ isActive }) => (isActive ? "mobile-nav__item is-active" : "mobile-nav__item")}>
          <span aria-hidden="true">◷</span>
          <span>Activity</span>
        </NavLink>
        <button type="button" className="mobile-nav__item" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <span aria-hidden="true">☰</span>
          <span>Menu</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="TNCOS" side="bottom">
        {visibleGroups.map((group) => (
          <div key={group.key} className="mobile-nav-drawer__group">
            <div className="sidebar__group-label">{group.label}</div>
            <ul className="mobile-nav-drawer__list">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end} onClick={() => setMoreOpen(false)} className="mobile-nav-drawer__link">
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Drawer>
    </>
  );
}
