import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

const EMPTY_FORM = {
  username: "",
  display_name: "",
  avatar_url: "",
  role_id: "",
  department_id: "",
  team_id: "",
  position_id: "",
  author_id: "",
};

export default function UserForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { recordActivity } = useAuth();
  const isNew = id === undefined;

  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [authors, setAuthors] = useState([]);

  const [lookupEmail, setLookupEmail] = useState("");
  const [candidate, setCandidate] = useState(null); // { auth_user_id, email } sau khi tra cứu thành công
  const [lookupError, setLookupError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("roles").select("id, name, key").is("deleted_at", null).order("sort_order"),
      supabase.from("departments").select("id, name").is("deleted_at", null).order("sort_order"),
      supabase.from("teams").select("id, name, department_id").is("deleted_at", null).order("sort_order"),
      supabase.from("positions").select("id, name").is("deleted_at", null).order("sort_order"),
      supabase.from("authors").select("id, name, slug").is("deleted_at", null).order("name"),
    ]).then(([r, d, t, p, a]) => {
      setRoles(r.data || []);
      setDepartments(d.data || []);
      setTeams(t.data || []);
      setPositions(p.data || []);
      setAuthors(a.data || []);
    });
  }, []);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      const { data, error: err } = await supabase.from("dashboard_users").select("*").eq("id", id).maybeSingle();
      if (err) {
        setError(err.message);
      } else if (data) {
        setEmail(data.email);
        setForm({
          username: data.username || "",
          display_name: data.display_name || "",
          avatar_url: data.avatar_url || "",
          role_id: data.role_id || "",
          department_id: data.department_id || "",
          team_id: data.team_id || "",
          position_id: data.position_id || "",
          author_id: data.author_id || "",
        });
      }
      setLoading(false);
    }
    load();
  }, [id, isNew]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function handleLookup(e) {
    e.preventDefault();
    setLookupError("");
    setLookupBusy(true);
    const { data, error: err } = await supabase.rpc("find_dashboard_candidate", { lookup_email: lookupEmail.trim() });
    setLookupBusy(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (err || !row) {
      setLookupError(
        "Không tìm thấy tài khoản Supabase Auth khớp email này. Tạo tài khoản tại Supabase Studio → Authentication → Users trước, rồi thử lại.",
      );
      return;
    }
    if (row.already_provisioned) {
      setLookupError("Email này đã có hồ sơ Dashboard User rồi.");
      return;
    }
    setCandidate(row);
    setEmail(row.email);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      username: form.username.trim() || null,
      display_name: form.display_name.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      role_id: form.role_id || null,
      department_id: form.department_id || null,
      team_id: form.team_id || null,
      position_id: form.position_id || null,
      author_id: form.author_id || null,
    };
    let err;
    if (isNew) {
      ({ error: err } = await supabase.from("dashboard_users").insert({ id: candidate.auth_user_id, email, ...payload }));
      if (!err) recordActivity("user.create", "dashboard_users", candidate.auth_user_id);
    } else {
      ({ error: err } = await supabase.from("dashboard_users").update(payload).eq("id", id));
      if (!err) recordActivity("user.update", "dashboard_users", id);
    }
    setSaving(false);
    if (err) return setError(err.message);
    if (isNew) navigate(`/users/${candidate.auth_user_id}`, { replace: true });
    else setSaved(true);
  }

  if (loading) return <div className="page">Đang tải…</div>;

  if (isNew && !candidate) {
    return (
      <div className="page">
        <div className="page__header">
          <h1>User mới</h1>
        </div>
        <p className="muted small">
          Nhập email tài khoản Supabase Auth đã được tạo sẵn (Supabase Studio → Authentication → Users). Dashboard
          không tự tạo được tài khoản Auth mới (cần quyền admin/service_role, không được nhúng vào client).
        </p>
        <form className="form" onSubmit={handleLookup}>
          <label>
            Email
            <input type="email" required value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} />
          </label>
          {lookupError && <p className="field-error">{lookupError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn--solid" disabled={lookupBusy}>
              {lookupBusy ? "Đang tra cứu…" : "Tra cứu"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const teamOptions = teams.filter((t) => !form.department_id || t.department_id === form.department_id);

  return (
    <div className="page">
      <div className="page__header">
        <h1>{isNew ? "User mới" : "Sửa User"}</h1>
      </div>
      {!isNew && <p className="muted small">Email: {email}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Username
          <input value={form.username} onChange={(e) => update("username", e.target.value)} placeholder="vd: an.nguyen" />
        </label>
        <label>
          Tên hiển thị
          <input value={form.display_name} onChange={(e) => update("display_name", e.target.value)} />
        </label>
        <label>
          Avatar URL
          <input value={form.avatar_url} onChange={(e) => update("avatar_url", e.target.value)} />
        </label>

        <label>
          Role
          <select value={form.role_id} onChange={(e) => update("role_id", e.target.value)}>
            <option value="">— Chọn role —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Lưu ý: nếu đây là hồ sơ của chính bạn và bạn không có quyền users.manage, hệ thống sẽ tự giữ nguyên
          Role/Department/Team/Position/Tác giả liên kết bất kể form gửi gì lên (chống tự leo thang quyền).
        </p>

        <label>
          Liên kết hồ sơ tác giả (nếu có byline công khai)
          <select value={form.author_id} onChange={(e) => update("author_id", e.target.value)}>
            <option value="">— Không liên kết —</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.slug})
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Department
            <select value={form.department_id} onChange={(e) => update("department_id", e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Team
            <select value={form.team_id} onChange={(e) => update("team_id", e.target.value)}>
              <option value="">—</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Position
            <select value={form.position_id} onChange={(e) => update("position_id", e.target.value)}>
              <option value="">—</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="field-error">{error}</p>}
        {saved && <p className="muted small">Đã lưu.</p>}

        <div className="form-actions">
          <button type="submit" className="btn btn--solid" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
