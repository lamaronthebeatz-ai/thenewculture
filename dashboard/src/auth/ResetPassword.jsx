import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ResetPassword() {
  const { updatePassword, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("2 mật khẩu không khớp nhau.");
      return;
    }
    setSubmitting(true);
    const err = await updatePassword(password);
    setSubmitting(false);
    if (err) {
      setError(err.message || "Không đổi được mật khẩu.");
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/"), 1500);
  }

  // status === "signed-out" nghĩa là link khôi phục không hợp lệ/đã hết hạn
  // (Supabase không cấp được session PASSWORD_RECOVERY).
  if (status === "signed-out") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Link đã hết hạn</h1>
          <p className="auth-subtitle">
            Link đặt lại mật khẩu này không còn hợp lệ. Vào lại trang "Quên mật khẩu" để gửi link mới.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Đặt mật khẩu mới</h1>
        {done ? (
          <p className="auth-subtitle">Đã đổi mật khẩu thành công. Đang chuyển về Dashboard…</p>
        ) : (
          <>
            <label>
              Mật khẩu mới
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Nhập lại mật khẩu mới
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Đang lưu…" : "Đổi mật khẩu"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
