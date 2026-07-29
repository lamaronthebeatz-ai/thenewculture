import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const MENU_KEYS = [
  { key: "header_primary", label: "Menu chính (đầu trang)" },
  { key: "header_mega", label: "Mega Menu (Khám phá / Tổ chức)" },
  { key: "footer", label: "Menu chân trang" },
  { key: "social", label: "Mạng xã hội" },
  { key: "quick_link", label: "Liên kết nhanh" },
];

const LINK_KINDS = ["series", "category", "article", "external", "custom_path"];

const EMPTY_FORM = { label: "", link_kind: "custom_path", link_value: "", parent_id: "", sort_order: 0 };

export default function MenuBuilder() {
  const [activeKey, setActiveKey] = useState(MENU_KEYS[0].key);
  const [menuId, setMenuId] = useState(null);
  const [items, setItems] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: menu, error: menuErr } = await supabase
      .from("menus")
      .select("id")
      .eq("key", activeKey)
      .maybeSingle();
    if (menuErr || !menu) {
      setError(menuErr?.message || "Chưa chạy migration Rev 7 (bảng menus rỗng).");
      setMenuId(null);
      setItems([]);
      setLoading(false);
      return;
    }
    setMenuId(menu.id);
    let query = supabase
      .from("menu_items")
      .select("id, parent_id, label, link_kind, link_value, sort_order, is_active, deleted_at")
      .eq("menu_id", menu.id)
      .order("sort_order");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setItems([]);
    } else {
      setItems(data);
    }
    setLoading(false);
  }, [activeKey, showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      label: item.label,
      link_kind: item.link_kind,
      link_value: item.link_value,
      parent_id: item.parent_id || "",
      sort_order: item.sort_order,
    });
  }

  function startNew() {
    setEditingId("new");
    setForm({ ...EMPTY_FORM, sort_order: items.length });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.label.trim() || !form.link_value.trim()) {
      setError("Nhãn và giá trị liên kết là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      menu_id: menuId,
      parent_id: form.parent_id || null,
      label: form.label.trim(),
      link_kind: form.link_kind,
      link_value: form.link_value.trim(),
      sort_order: Number(form.sort_order) || 0,
    };
    const query =
      editingId === "new"
        ? supabase.from("menu_items").insert(payload)
        : supabase.from("menu_items").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleDeleted(item) {
    const next = item.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("menu_items").update({ deleted_at: next }).eq("id", item.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  async function toggleActive(item) {
    const { error: err } = await supabase.from("menu_items").update({ is_active: !item.is_active }).eq("id", item.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  const parentOptions = items.filter((i) => !i.parent_id && i.id !== editingId);

  return (
    <div className="page">
      <div className="page__header">
        <h1>Menu Builder</h1>
      </div>
      <p className="muted small">
        Menu "Menu chính (đầu trang)" thay thế danh sách series cố định trên đầu trang; "Menu chân trang" thay thế các
        cột liên kết ở footer. Cả hai: nếu chưa thêm mục nào ở đây, website tiếp tục hiển thị đúng nội dung mặc định
        hiện tại, không có gì thay đổi.
      </p>

      <div className="toolbar">
        <select value={activeKey} onChange={(e) => setActiveKey(e.target.value)}>
          {MENU_KEYS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả mục đã xoá
        </label>
        {editingId === null && menuId && (
          <button className="btn btn--solid" onClick={startNew}>
            + Mục mới
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <label>
              Nhãn hiển thị *
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </label>
            <label>
              Thuộc mục cha (chỉ Mega Menu cần)
              <select value={form.parent_id} onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}>
                <option value="">— Không có (mục gốc) —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Loại liên kết
              <select value={form.link_kind} onChange={(e) => setForm((f) => ({ ...f, link_kind: e.target.value }))}>
                {LINK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giá trị liên kết *
              <input
                value={form.link_value}
                onChange={(e) => setForm((f) => ({ ...f, link_value: e.target.value }))}
                placeholder={
                  form.link_kind === "series" || form.link_kind === "category"
                    ? "slug, vd: tnc-origins"
                    : "URL đầy đủ hoặc đường dẫn tĩnh, vd: all-series.html"
                }
                required
              />
            </label>
            <label>
              Thứ tự
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
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
              <th>Thứ tự</th>
              <th>Nhãn</th>
              <th>Liên kết</th>
              <th>Thuộc mục cha</th>
              <th>Hoạt động</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.deleted_at ? "is-deleted" : ""}>
                <td>{i.sort_order}</td>
                <td>{i.label}</td>
                <td className="muted small">
                  {i.link_kind}: {i.link_value}
                </td>
                <td className="muted small">{items.find((p) => p.id === i.parent_id)?.label || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleActive(i)}>
                    {i.is_active ? "Đang bật" : "Đã tắt"}
                  </button>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => startEdit(i)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(i)}>
                    {i.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Chưa có mục nào trong menu này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
