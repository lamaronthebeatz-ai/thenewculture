import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

const EMPTY_FORM = { key: "", label: "", description: "", module: "", config_schema: "[]", is_active: true };

// "Danh mục Khối" (Rev 17) — Registry của Layout Builder. Đây là nửa DỮ LIỆU
// của kiến trúc plugin: thêm 1 hàng ở đây khiến khối xuất hiện trong "Thêm
// Khối" (Bố cục Trang chủ/Bố cục Trang) ngay lập tức, KHÔNG cần deploy code.
// Nhưng khối chỉ THẬT SỰ hiển thị trên website nếu build.py đã có hàm render
// tương ứng (BLOCK_RENDERERS trong scripts/build.py) — đây là giới hạn vật
// lý của static site generator, không phải thiếu sót: tạo 1 khối mới ở đây
// mà chưa có renderer sẽ hiện gắn nhãn "Chưa có renderer" trong Bố cục, và
// build.py tự bỏ qua an toàn (không crash) cho tới khi có code tương ứng.
export default function BlockRegistry() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("layout.create");
  const canEdit = hasPermission("layout.edit");

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase.from("layout_block_types").select("*").order("sort_order");
    if (err) {
      setError(err.message);
      setTypes([]);
    } else {
      setTypes(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingKey("__new__");
    setForm(EMPTY_FORM);
  }

  function startEdit(t) {
    setEditingKey(t.key);
    setForm({
      key: t.key,
      label: t.label,
      description: t.description || "",
      module: t.module || "",
      config_schema: JSON.stringify(t.config_schema || [], null, 2),
      is_active: t.is_active,
    });
  }

  function cancelEdit() {
    setEditingKey(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.key.trim() || !form.label.trim()) {
      setError("Mã khối (key) và Tên hiển thị là bắt buộc.");
      return;
    }
    let schema;
    try {
      schema = JSON.parse(form.config_schema || "[]");
      if (!Array.isArray(schema)) throw new Error("config_schema phải là 1 mảng (array).");
    } catch (err) {
      setError(`Cấu hình JSON không hợp lệ: ${err.message}`);
      return;
    }
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      description: form.description.trim() || null,
      module: form.module.trim() || null,
      config_schema: schema,
      is_active: form.is_active,
    };
    const query =
      editingKey === "__new__"
        ? supabase.from("layout_block_types").insert({ ...payload, key: form.key.trim() })
        : supabase.from("layout_block_types").update(payload).eq("key", editingKey);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleActive(t) {
    const { error: err } = await supabase.from("layout_block_types").update({ is_active: !t.is_active }).eq("key", t.key);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Danh mục Khối</h1>
        {canCreate && editingKey === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Đăng ký Khối mới
          </button>
        )}
      </div>
      <p className="muted small">
        Đăng ký 1 Khối ở đây để nó xuất hiện trong "Thêm Khối" (Bố cục Trang chủ/Bố cục Trang). Khối mới cần có sẵn
        cách hiển thị (renderer) trong build.py mới thật sự hiện trên website — đăng ký ở đây chỉ để nó xuất hiện
        trong danh sách chọn, không tự tạo cách hiển thị.
      </p>

      {editingKey !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Mã khối (key) *
              <input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                disabled={editingKey !== "__new__"}
                placeholder="vd: podcast_list"
                required
              />
            </label>
            <label>
              Tên hiển thị *
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </label>
          </div>
          <label>
            Mô tả
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <label>
            Module liên quan (tuỳ chọn, chỉ để ghi chú)
            <input value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} />
          </label>
          <label>
            Cấu hình khối (config_schema, JSON)
            <textarea
              rows={10}
              value={form.config_schema}
              onChange={(e) => setForm((f) => ({ ...f, config_schema: e.target.value }))}
              style={{ fontFamily: "monospace", fontSize: 13 }}
            />
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Đang bật (hiện trong "Thêm Khối")
          </label>
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

      {error && editingKey === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Khối</th>
              <th>Mã (key)</th>
              <th>Số field cấu hình</th>
              <th>Đang bật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.key}>
                <td>
                  {t.label}
                  {t.description && <div className="muted small">{t.description}</div>}
                </td>
                <td className="muted small">{t.key}</td>
                <td>{(t.config_schema || []).length}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleActive(t)} disabled={!canEdit}>
                    {t.is_active ? "Đang bật" : "Đã tắt"}
                  </button>
                </td>
                <td>
                  {canEdit && (
                    <button className="btn btn--ghost btn--sm" onClick={() => startEdit(t)}>
                      Sửa
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Chưa có Khối nào trong danh mục.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
