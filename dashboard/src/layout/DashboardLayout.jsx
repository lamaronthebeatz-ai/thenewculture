import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../auth/AuthContext";

export default function DashboardLayout() {
  const { editorProfile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <header className="topbar">
          <div />
          <div className="topbar__user">
            <span>{editorProfile?.name || "Editor"}</span>
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
