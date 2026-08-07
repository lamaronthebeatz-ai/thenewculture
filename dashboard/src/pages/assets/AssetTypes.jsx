import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadCategoriesForSelect, slugify } from "../../lib/assetsData";

const EMPTY_FORM = { category_id: "", name: "", slug: "", description: "", sort_order: 0, is_active: true };

// "Loại tài sản" (PHẦN VI spec) — CRUD đầy đủ, thuộc 1 Danh mục. Không giới
// hạn danh sách loại (Admin tự thêm được).
export default function AssetTypes() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("assets.create");
  const canEdit = hasPermission("assets.edit");
  const canDelete = hasPermission("assets.delete");

  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [typesRes, cats] = await Promise.all([
      supabase
        .from("asset_types")
        .select("*, asset_categories(name)")
        .is("deleted_at", null)
        .order("sort_order"),
      loadCategoriesForSelect(),
    ]);
    if (typesRes.error) {
      setError(typesRes.error.message);
      setRows([]);
    } else {
      setRows(typesRes.data);
    }
    setCategories(cats);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id || "" });
  }
  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      category_id: row.category_id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
      sort_order: row.sort_order,
      is_active: row.is_active,
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.category_id) {
      setError("Tên loại tài sản và Danh mục là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      category_id: form.category_id,
      name: form.name.trim(),
      slug: (form.slug.trim() || slugify(form.name)).trim(),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const query =
      editingId === "__new__"
        ? supabase.from("asset_types").insert(payload)
        : supabase.from("asset_types").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function softDelete(row) {
    if (!confirm(`Xoá loại tài sản "${row.name}"?`)) return;
    const { error: err } = await supabase.from("asset_types").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Loại tài sản</h1>
        {canCreate && editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Thêm loại tài sản
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Danh mục *
              <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} required>
                <option value="" disabled>
                  — Chọn danh mục —
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tên loại tài sản *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
          </div>
          <label>
            Mô tả
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="form-grid">
            <label>
              Thứ tự
              <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Đang bật
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

      {error && editingId === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Loại tài sản</th>
              <th>Danh mục</th>
              <th>Đang bật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="muted small">{r.asset_categories?.name || "—"}</td>
                <td>{r.is_active ? "Đang bật" : "Đã tắt"}</td>
                <td className="table-actions">
                  {canEdit && (
                    <button className="btn btn--ghost btn--sm" onClick={() => startEdit(r)}>
                      Sửa
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn--ghost btn--sm" onClick={() => softDelete(r)}>
                      Xoá
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có loại tài sản nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
