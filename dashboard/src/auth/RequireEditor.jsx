import { useAuth } from "./AuthContext";
import Login from "./Login";

export default function RequireEditor({ children }) {
  const { status, signOut } = useAuth();

  if (status === "loading") {
    return (
      <div className="auth-screen">
        <p>Đang tải…</p>
      </div>
    );
  }

  if (status === "signed-out") {
    return <Login />;
  }

  if (status === "not-editor") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Không có quyền truy cập</h1>
          <p className="auth-subtitle">
            Tài khoản này đã đăng nhập thành công nhưng không phải hồ sơ biên
            tập viên đang hoạt động (không khớp email trong bảng authors).
            Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.
          </p>
          <button onClick={signOut}>Đăng xuất</button>
        </div>
      </div>
    );
  }

  return children;
}
