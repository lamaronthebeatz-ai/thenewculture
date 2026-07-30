import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";
import { GENERIC_ROLES, EDITOR_ROLES, EDITOR_HONORS, EDITOR_BADGES } from "../lib/editorRegistries";

const EMPTY_FORM = {
  slug: "",
  name: "",
  email: "",
  avatar_url: "",
  bio: "",
  role: "editor",
  honor: "",
  badges: [],
  is_active: true,
};

export default function AuthorForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    // Bug fix (production audit): chặn setState nếu :id đã đổi trước khi
    // request này về (React Router không remount, chỉ re-run effect) —
    // tránh ghi đè form đang hiển thị đúng bằng dữ liệu của author khác.
    let cancelled = false;
    supabase
      .from("authors")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(err?.message || "Không tìm thấy author.");
        } else {
          setForm({
            slug: data.slug,
            name: data.name,
            email: data.email || "",
            avatar_url: data.avatar_url || "",
            bio: data.bio || "",
            role: data.role,
            honor: data.honor || "",
            badges: data.badges || [],
            is_active: data.is_active,
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleBadge(badgeId) {
    setForm((f) => ({
      ...f,
      badges: f.badges.includes(badgeId) ? f.badges.filter((b) => b !== badgeId) : [...f.badges, badgeId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.slug.trim() || !form.name.trim()) {
      setError("Slug và Tên là bắt buộc.");
      return;
    }

    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      email: form.email.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      bio: form.bio.trim() || null,
      role: form.role,
      honor: form.honor || null,
      badges: form.badges,
      is_active: form.is_active,
    };

    const query = isNew
      ? supabase.from("authors").insert(payload)
      : supabase.from("authors").update(payload).eq("id", id);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    navigate("/authors");
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <h1>{isNew ? "Author mới" : "Sửa author"}</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Slug *
            <input value={form.slug} onChange={(e) => update("slug", e.target.value)} required />
          </label>
          <label>
            Tên *
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </label>
          <label className="checkbox-inline" style={{ alignSelf: "end" }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Đang hoạt động (hiển thị công khai)
          </label>
        </div>

        <ImageUploader
          label="Ảnh đại diện"
          value={form.avatar_url}
          onChange={(v) => update("avatar_url", v)}
          pathPrefix="authors/avatar"
        />

        <label>
          Tiểu sử
          <textarea rows={4} value={form.bio} onChange={(e) => update("bio", e.target.value)} />
        </label>

        <div className="form-grid">
          <label>
            Vai trò (role)
            <select value={form.role} onChange={(e) => update("role", e.target.value)}>
              <optgroup label="Role_id tiếng Việt (Editor Identity System)">
                {Object.entries(EDITOR_ROLES).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Giá trị chung (không có trang tác giả riêng)">
                {GENERIC_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Vinh danh chính (honor)
            <select value={form.honor} onChange={(e) => update("honor", e.target.value)}>
              <option value="">— Không có —</option>
              {Object.entries(EDITOR_HONORS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <label className="field-label">Huy hiệu (badges)</label>
          <div className="tag-chips">
            {Object.entries(EDITOR_BADGES).map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={form.badges.includes(id) ? "tag-chip is-selected" : "tag-chip"}
                onClick={() => toggleBadge(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate("/authors")}>
            Huỷ
          </button>
          <button type="submit" className="btn btn--solid" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}

function friendlyError(err) {
  if (err.code === "23505") return "Slug hoặc email này đã tồn tại — vui lòng chọn giá trị khác.";
  return err.message;
}
