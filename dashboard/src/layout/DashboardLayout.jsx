import { Outlet, Link } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../auth/AuthContext";

export default function DashboardLayout() {
  const { editorProfile, dashboardUser, signOut } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <header className="topbar">
          <div />
          <div className="topbar__user">
            <Link to="/profile">{dashboardUser?.display_name || editorProfile?.name || "Editor"}</Link>
            <button className="btn btn--ghost" onClick={signOut}>
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
