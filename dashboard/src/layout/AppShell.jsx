import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import { InspectorProvider } from "./InspectorContext";
import { ALL_NAV_ITEMS } from "./navConfig";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorage } from "../lib/useLocalStorage";
import { useViewport } from "../lib/useViewport";
import UniversalSearch from "../components/UniversalSearch";
import MobileNav from "./MobileNav";

const RECENT_LIMIT = 5;

function useTrackRecent() {
  const location = useLocation();
  const [, setRecent] = useLocalStorage("tncos.recent", []);

  useEffect(() => {
    const match = ALL_NAV_ITEMS.find((item) => item.to === location.pathname);
    if (!match) return;
    setRecent((prev) => {
      const next = [{ to: match.to, label: match.label }, ...prev.filter((r) => r.to !== match.to)];
      return next.slice(0, RECENT_LIMIT);
    });
  }, [location.pathname, setRecent]);
}

function ShellInner() {
  const { editorProfile, dashboardUser, signOut } = useAuth();
  const { isDesktop } = useViewport();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useTrackRecent();

  const location = useLocation();
  useEffect(() => setMobileSidebarOpen(false), [location.pathname]);

  return (
    <div className="app-shell">
      <a href="#tncos-main" className="skip-link">
        Bỏ qua tới nội dung chính
      </a>
      {mobileSidebarOpen && <div className="sidebar-overlay-scrim" onClick={() => setMobileSidebarOpen(false)} />}
      <Sidebar mobileOpen={mobileSidebarOpen} />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="tncos-btn tncos-btn--ghost tncos-btn--icon topbar__menu-btn"
            onClick={() => setMobileSidebarOpen((o) => !o)}
            aria-label="Mở điều hướng"
            aria-expanded={mobileSidebarOpen}
          >
            ☰
          </button>
          <button type="button" className="topbar__search-trigger" onClick={() => setSearchOpen(true)}>
            <span aria-hidden="true">⌕</span>
            <span className="topbar__search-label">Tìm Article, Media, Author, Series, Category, User…</span>
          </button>
          <div className="topbar__user">
            <Link to="/profile">{dashboardUser?.display_name || editorProfile?.name || "Editor"}</Link>
            <button className="tncos-btn tncos-btn--ghost tncos-btn--sm" onClick={signOut}>
              Đăng xuất
            </button>
          </div>
        </header>
        <div className="app-body">
          <main className="content" id="tncos-main">
            <Outlet />
          </main>
          <InspectorPanel variant={isDesktop ? "panel" : "drawer"} />
        </div>
      </div>
      <MobileNav onOpenSearch={() => setSearchOpen(true)} />
      <UniversalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

// TNCOS App Shell — layout 3 panel (Sidebar | Main Workspace | Inspector) ở
// desktop, thu về 2 panel (Sidebar overlay) ở tablet, bottom nav fullscreen
// ở mobile (xem shell.css). Thay cho DashboardLayout cũ — cùng vai trò
// (route element bọc <Outlet/>), không đổi cách App.jsx dùng nó.
export default function AppShell() {
  return (
    <InspectorProvider>
      <ShellInner />
    </InspectorProvider>
  );
}
