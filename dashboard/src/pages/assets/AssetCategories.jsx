import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { slugify } from "../../lib/assetsData";

const EMPTY_FORM = { name: "", slug: "", description: "", sort_order: 0, is_active: true };

// "Danh mục tài sản" (PHẦN V spec) — CRUD đầy đủ, Admin tự thêm được (vd
// ngoài 10 danh mục mặc định: Nội dung/Thương hiệu/Hạ tầng/Thiết kế/Nghiên
// cứu/Kiến thức/Phần mềm/Marketing/Kinh doanh/Khác).
export default function AssetCategories() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("assets.create");
  const canEdit = hasPermission("assets.edit");
  const canDelete = hasPermission("assets.delete");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("asset_categories")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order");
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setForm(EMPTY_FORM);
  }
  function startEdit(row) {
    setEditingId(row.id);
    setForm({
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
    if (!form.name.trim()) {
      setError("Tên danh mục là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      slug: (form.slug.trim() || slugify(form.name)).trim(),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const query =
      editingId === "__new__"
        ? supabase.from("asset_categories").insert(payload)
        : supabase.from("asset_categories").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function softDelete(row) {
    if (!confirm(`Xoá danh mục "${row.name}"?`)) return;
    const { error: err } = await supabase
      .from("asset_categories")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Danh mục tài sản</h1>
        {canCreate && editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Thêm danh mục
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Tên danh mục *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
            <label>
              Mã (slug)
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="tự sinh từ tên nếu để trống"
              />
            </label>
          </div>
          <label>
            Mô tả
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="form-grid">
            <label>
              Thứ tự
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
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
              <th>Danh mục</th>
              <th>Mã</th>
              <th>Đang bật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.name}
                  {r.description && <div className="muted small">{r.description}</div>}
                </td>
                <td className="muted small">{r.slug}</td>
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
                  Chưa có danh mục tài sản nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
