import { Fragment, useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadTypesForSelect, formatVnd } from "../../lib/assetsData";

const EMPTY_FORM = {
  type_id: "",
  name: "",
  description: "",
  base_value: 0,
  metrics: "{}",
  override_value: "",
  series_slug: "",
  module_key: "",
  is_active: true,
};

const REASON_LABEL = {
  created: "Tạo mới",
  engine_recompute: "Engine tự tính lại",
  manual_override: "Ghi đè thủ công",
};

// "Sổ tài sản" (PHẦN XII spec) — CRUD asset_items. Chỉ nhập ĐẦU VÀO
// (base_value/metrics) — computed_value do Engine ghi, hiển thị read-only.
// "Xem lịch sử" mở đúng asset_ledger của tài sản đó — append-only, không
// sửa/xoá được từ đây (đúng yêu cầu "Lưu toàn bộ lịch sử. Không ghi đè.").
export default function AssetLedgerPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("assets.create");
  const canEdit = hasPermission("assets.edit");
  const canDelete = hasPermission("assets.delete");

  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [historyForId, setHistoryForId] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [itemsRes, typesList] = await Promise.all([
      supabase
        .from("asset_items")
        .select("*, asset_types(name)")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      loadTypesForSelect(),
    ]);
    if (itemsRes.error) {
      setError(itemsRes.error.message);
      setItems([]);
    } else {
      setItems(itemsRes.data);
    }
    setTypes(typesList);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setForm({ ...EMPTY_FORM, type_id: types[0]?.id || "" });
    setHistoryForId(null);
  }
  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      type_id: row.type_id,
      name: row.name,
      description: row.description || "",
      base_value: row.base_value,
      metrics: JSON.stringify(row.metrics || {}, null, 2),
      override_value: row.override_value ?? "",
      series_slug: row.series_slug || "",
      module_key: row.module_key || "",
      is_active: row.is_active,
    });
    setHistoryForId(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.type_id) {
      setError("Tên tài sản và Loại tài sản là bắt buộc.");
      return;
    }
    let metrics;
    try {
      metrics = JSON.parse(form.metrics || "{}");
      if (typeof metrics !== "object" || Array.isArray(metrics)) throw new Error("metrics phải là 1 object JSON.");
    } catch (err) {
      setError(`Dữ liệu đầu vào (metrics) không hợp lệ: ${err.message}`);
      return;
    }
    setSaving(true);
    const payload = {
      type_id: form.type_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      base_value: Number(form.base_value) || 0,
      metrics,
      override_value: form.override_value === "" ? null : Number(form.override_value),
      series_slug: form.series_slug.trim() || null,
      module_key: form.module_key.trim() || null,
      is_active: form.is_active,
    };
    const query =
      editingId === "__new__"
        ? supabase.from("asset_items").insert(payload)
        : supabase.from("asset_items").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function softDelete(row) {
    if (!confirm(`Xoá tài sản "${row.name}"?`)) return;
    const { error: err } = await supabase.from("asset_items").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  async function toggleHistory(row) {
    if (historyForId === row.id) {
      setHistoryForId(null);
      return;
    }
    const { data, error: err } = await supabase
      .from("asset_ledger")
      .select("*")
      .eq("asset_item_id", row.id)
      .order("changed_at", { ascending: false });
    if (err) return alert(`Không tải được lịch sử: ${err.message}`);
    setHistory(data || []);
    setHistoryForId(row.id);
  }

  return (
    <div className="page page--wide">
      <div className="page__header">
        <h1>Sổ tài sản</h1>
        {canCreate && editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Ghi nhận tài sản mới
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24, maxWidth: 720 }}>
          <div className="form-grid">
            <label>
              Loại tài sản *
              <select value={form.type_id} onChange={(e) => setForm((f) => ({ ...f, type_id: e.target.value }))} required>
                <option value="" disabled>
                  — Chọn loại tài sản —
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.asset_categories?.name})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tên tài sản *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </label>
          </div>
          <label>
            Mô tả
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="form-grid">
            <label>
              Giá trị cơ bản (đầu vào)
              <input
                type="number"
                step="0.01"
                value={form.base_value}
                onChange={(e) => setForm((f) => ({ ...f, base_value: e.target.value }))}
              />
            </label>
            <label>
              Ghi đè riêng (tuỳ chọn — để trống nếu dùng giá trị Engine tính)
              <input
                type="number"
                step="0.01"
                value={form.override_value}
                onChange={(e) => setForm((f) => ({ ...f, override_value: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Dữ liệu đầu vào khác (metrics, JSON — khớp field_path của Công thức tính, vd {"{"}"seo_score": 80{"}"})
            <textarea
              rows={4}
              value={form.metrics}
              onChange={(e) => setForm((f) => ({ ...f, metrics: e.target.value }))}
              style={{ fontFamily: "monospace", fontSize: 13 }}
            />
          </label>
          <div className="form-grid form-grid--3">
            <label>
              Series (tuỳ chọn)
              <input value={form.series_slug} onChange={(e) => setForm((f) => ({ ...f, series_slug: e.target.value }))} />
            </label>
            <label>
              Module (tuỳ chọn)
              <input value={form.module_key} onChange={(e) => setForm((f) => ({ ...f, module_key: e.target.value }))} />
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Đang sử dụng
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
              <th>Tài sản</th>
              <th>Loại</th>
              <th style={{ textAlign: "right" }}>Giá trị hiệu lực</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>
                    {r.name}
                    {!r.is_active && <span className="muted small"> — không còn sử dụng</span>}
                  </td>
                  <td className="muted small">{r.asset_types?.name || "—"}</td>
                  <td className="asset-value-cell">
                    <strong>{formatVnd(r.effective_value)}</strong>
                    {r.override_value !== null && <span className="muted">Đã ghi đè</span>}
                  </td>
                  <td className="table-actions">
                    <button className="btn btn--ghost btn--sm" onClick={() => toggleHistory(r)}>
                      {historyForId === r.id ? "Ẩn lịch sử" : "Xem lịch sử"}
                    </button>
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
                {historyForId === r.id && (
                  <tr>
                    <td colSpan={4} style={{ background: "var(--bg)" }}>
                      {history.length === 0 ? (
                        <p className="muted small">Chưa có lịch sử.</p>
                      ) : (
                        <table className="data-table data-table--compact">
                          <thead>
                            <tr>
                              <th>Ngày</th>
                              <th>Lý do</th>
                              <th style={{ textAlign: "right" }}>Giá trị cũ</th>
                              <th style={{ textAlign: "right" }}>Giá trị mới</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((h) => (
                              <tr key={h.id}>
                                <td className="muted small">{new Date(h.changed_at).toLocaleString("vi-VN")}</td>
                                <td>{REASON_LABEL[h.reason] || h.reason}</td>
                                <td style={{ textAlign: "right" }}>{formatVnd(h.old_value)}</td>
                                <td style={{ textAlign: "right" }}>{formatVnd(h.new_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có tài sản nào trong Sổ tài sản.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
