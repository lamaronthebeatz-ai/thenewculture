import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const EMPTY_FORM = { slug: "", name: "" };

export default function TagsList() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase.from("tags").select("id, slug, name, deleted_at").order("name");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setTags([]);
    } else {
      setTags(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(tag) {
    setEditingId(tag.id);
    setForm({ slug: tag.slug, name: tag.name });
  }

  function startNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.slug.trim() || !form.name.trim()) {
      setError("Slug và Tên là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = { slug: form.slug.trim(), name: form.name.trim() };
    const query =
      editingId === "new"
        ? supabase.from("tags").insert(payload)
        : supabase.from("tags").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "Slug hoặc tên này đã tồn tại." : err.message);
      return;
    }
    cancelEdit();
    load();
  }

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("tags").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Tags</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Tag mới
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <label>
              Slug *
              <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
            </label>
            <label>
              Tên *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
              Huỷ
            </button>
            <button type="submit" className="btn btn--solid" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả tag đã xoá
        </label>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Slug</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id} className={t.deleted_at ? "is-deleted" : ""}>
                <td>{t.name}</td>
                <td className="muted small">{t.slug}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => startEdit(t)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(t)}>
                    {t.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Chưa có tag nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
