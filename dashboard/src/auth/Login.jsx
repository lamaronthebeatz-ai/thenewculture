import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Dịch nghĩa các lỗi phổ biến nhất từ Supabase Auth (GoTrue) — hiện nguyên
// văn message gốc kèm theo để không che mất thông tin khi debug (đây là
// công cụ nội bộ cho editor/admin, không phải form public cần giấu chi tiết
// lỗi vì lý do bảo mật).
function describeAuthError(err) {
  const msg = err?.message || "";
  if (/invalid login credentials/i.test(msg)) {
    return "Sai email hoặc mật khẩu — hoặc tài khoản này chưa được tạo trong Supabase Auth (Authentication → Users).";
  }
  if (/email not confirmed/i.test(msg)) {
    return "Tài khoản chưa xác nhận email. Vào Supabase Dashboard → Authentication → Users → chọn user này → bật 'Auto Confirm User' hoặc gửi lại email xác nhận.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Không kết nối được tới Supabase — kiểm tra lại VITE_SUPABASE_URL trong Cloudflare Pages Environment Variables.";
  }
  return `Đăng nhập thất bại: ${msg || "lỗi không xác định"}`;
}

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const err = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(describeAuthError(err));
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>TNCOS</h1>
        <p className="auth-subtitle">The New Culture Operating System — Đăng nhập bằng tài khoản biên tập viên</p>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
        <p className="auth-subtitle">
          <Link to="/forgot-password">Quên mật khẩu?</Link>
        </p>
      </form>
    </div>
  );
}
