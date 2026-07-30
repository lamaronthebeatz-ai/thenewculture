import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime } from "../lib/format";

export default function Profile() {
  const { session, dashboardUser, updatePassword } = useAuth();
  const [form, setForm] = useState({ username: "", display_name: "", avatar_url: "" });
  const [role, setRole] = useState(null);
  const [org, setOrg] = useState({ department: null, team: null, position: null });
  const [loginHistory, setLoginHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  useEffect(() => {
    if (!dashboardUser) return;
    setForm({
      username: dashboardUser.username || "",
      display_name: dashboardUser.display_name || "",
      avatar_url: dashboardUser.avatar_url || "",
    });
    Promise.all([
      dashboardUser.role_id ? supabase.from("roles").select("name").eq("id", dashboardUser.role_id).maybeSingle() : Promise.resolve({ data: null }),
      dashboardUser.department_id
        ? supabase.from("departments").select("name").eq("id", dashboardUser.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
      dashboardUser.team_id ? supabase.from("teams").select("name").eq("id", dashboardUser.team_id).maybeSingle() : Promise.resolve({ data: null }),
      dashboardUser.position_id
        ? supabase.from("positions").select("name").eq("id", dashboardUser.position_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([r, d, t, p]) => {
      setRole(r.data);
      setOrg({ department: d.data, team: t.data, position: p.data });
    });
    supabase
      .from("activity_log")
      .select("created_at, metadata")
      .eq("actor_id", dashboardUser.id)
      .eq("action", "login")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setLoginHistory(data || []));
  }, [dashboardUser]);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const { error: err } = await supabase
      .from("dashboard_users")
      .update({
        username: form.username.trim() || null,
        display_name: form.display_name.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
      })
      .eq("id", dashboardUser.id);
    setSaving(false);
    if (err) return setError(err.message);
    setSaved(true);
  }

  async function handleChangeEmail(e) {
    e.preventDefault();
    setEmailMsg("");
    setEmailBusy(true);
    const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailBusy(false);
    if (err) {
      setEmailMsg(err.message || "Không đổi được email.");
      return;
    }
    setEmailMsg("Đã gửi email xác nhận tới cả địa chỉ cũ và mới — email chỉ đổi sau khi bạn xác nhận qua link trong đó.");
    setNewEmail("");
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwMsg("");
    if (pw1.length < 8) return setPwMsg("Mật khẩu phải có ít nhất 8 ký tự.");
    if (pw1 !== pw2) return setPwMsg("2 mật khẩu không khớp nhau.");
    setPwBusy(true);
    const err = await updatePassword(pw1);
    setPwBusy(false);
    if (err) return setPwMsg(err.message || "Không đổi được mật khẩu.");
    setPwMsg("Đã đổi mật khẩu thành công.");
    setPw1("");
    setPw2("");
  }

  if (!dashboardUser) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hồ sơ của tôi</h1>
      </div>

      <div className="page__section" style={{ marginBottom: 24 }}>
        <p>
          <strong>Email:</strong> {session?.user?.email}
        </p>
        <p>
          <strong>Role:</strong> {role?.name || "—"}
        </p>
        <p>
          <strong>Tổ chức:</strong> {[org.department?.name, org.team?.name, org.position?.name].filter(Boolean).join(" / ") || "—"}
        </p>
        <p>
          <strong>Tạo lúc:</strong> {formatDateTime(dashboardUser.created_at)}
        </p>
        <p>
          <strong>Đăng nhập gần nhất:</strong> {formatDateTime(dashboardUser.last_login_at)}
        </p>
        <p>
          <strong>Provider:</strong> {dashboardUser.provider}
        </p>
      </div>

      <h2 style={{ fontSize: 16 }}>Thông tin hiển thị</h2>
      <form className="form" onSubmit={handleSave}>
        <label>
          Username
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
        </label>
        <label>
          Tên hiển thị
          <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
        </label>
        <label>
          Avatar URL
          <input value={form.avatar_url} onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))} />
        </label>
        {error && <p className="field-error">{error}</p>}
        {saved && <p className="muted small">Đã lưu.</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn--solid" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Đổi email</h2>
      <form className="form" onSubmit={handleChangeEmail}>
        <label>
          Email mới
          <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </label>
        {emailMsg && <p className="muted small">{emailMsg}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn--solid" disabled={emailBusy}>
            {emailBusy ? "Đang gửi…" : "Đổi email"}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Đổi mật khẩu</h2>
      <form className="form" onSubmit={handleChangePassword}>
        <label>
          Mật khẩu mới
          <input type="password" required autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
        </label>
        <label>
          Nhập lại mật khẩu mới
          <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {pwMsg && <p className="muted small">{pwMsg}</p>}
        <div className="form-actions">
          <button type="submit" className="btn btn--solid" disabled={pwBusy}>
            {pwBusy ? "Đang lưu…" : "Đổi mật khẩu"}
          </button>
        </div>
      </form>

      <h2 style={{ fontSize: 16, marginTop: 32 }}>Lịch sử đăng nhập gần đây</h2>
      <table className="data-table data-table--compact">
        <thead>
          <tr>
            <th>Thời điểm</th>
          </tr>
        </thead>
        <tbody>
          {loginHistory.map((row, i) => (
            <tr key={i}>
              <td>{formatDateTime(row.created_at)}</td>
            </tr>
          ))}
          {loginHistory.length === 0 && (
            <tr>
              <td className="muted">Chưa có dữ liệu.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
