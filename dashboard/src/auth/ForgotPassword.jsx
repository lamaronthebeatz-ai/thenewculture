import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const err = await resetPasswordForEmail(email.trim());
    setSubmitting(false);
    if (err) {
      setError(err.message || "Không gửi được email khôi phục.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Quên mật khẩu</h1>
        <p className="auth-subtitle">
          Nhập email tài khoản biên tập viên — hệ thống sẽ gửi 1 link đặt lại mật khẩu (link có hiệu lực trong thời
          gian giới hạn theo cấu hình Supabase Auth).
        </p>
        {sent ? (
          <p className="auth-subtitle">
            Đã gửi email tới <strong>{email.trim()}</strong> (nếu email này khớp 1 tài khoản đang tồn tại). Kiểm tra
            hộp thư (kể cả mục spam) và bấm vào link để đặt lại mật khẩu.
          </p>
        ) : (
          <>
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
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Đang gửi…" : "Gửi link khôi phục"}
            </button>
          </>
        )}
        <p className="auth-subtitle">
          <Link to="/">Quay lại đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
