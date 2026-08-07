import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadTypesForSelect } from "../../lib/assetsData";

const EMPTY_RULE = {
  name: "",
  default_value: 0,
  unit: "VND",
  valuation_method: "fixed",
  notes: "",
  allow_override: true,
  is_cumulative: false,
  has_depreciation: false,
  depreciation_rate: "",
  depreciation_period: "monthly",
};

// "Quy tắc định giá" (PHẦN VII spec) — mỗi Loại tài sản có ĐÚNG 1 quy tắc
// đang áp dụng (unique partial index valuation_rules_active_per_type ở
// Rev 19). Sửa ở đây = UPDATE thẳng bản ghi đang active — Engine tự tính
// lại NGAY LẬP TỨC cho mọi tài sản thuộc loại này (trigger, không cần Lưu
// gì thêm ở phía Sổ tài sản).
export default function AssetRules() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("assets.edit") || hasPermission("assets.create");

  const [types, setTypes] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [rule, setRule] = useState(null); // existing rule row, or null nếu chưa có
  const [form, setForm] = useState(EMPTY_RULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTypesForSelect().then((data) => {
      setTypes(data);
      if (data.length > 0) setSelectedTypeId(data[0].id);
      setLoading(false);
    });
  }, []);

  const loadRule = useCallback(async (typeId) => {
    if (!typeId) return;
    setLoading(true);
    setError("");
    setSaved(false);
    const { data, error: err } = await supabase
      .from("valuation_rules")
      .select("*")
      .eq("asset_type_id", typeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (err) {
      setError(err.message);
    } else if (data) {
      setRule(data);
      setForm({
        name: data.name,
        default_value: data.default_value,
        unit: data.unit,
        valuation_method: data.valuation_method,
        notes: data.notes || "",
        allow_override: data.allow_override,
        is_cumulative: data.is_cumulative,
        has_depreciation: data.has_depreciation,
        depreciation_rate: data.depreciation_rate ?? "",
        depreciation_period: data.depreciation_period || "monthly",
      });
    } else {
      setRule(null);
      const typeName = types.find((t) => t.id === typeId)?.name || "";
      setForm({ ...EMPTY_RULE, name: `Quy tắc ${typeName}` });
    }
    setLoading(false);
  }, [types]);

  useEffect(() => {
    if (selectedTypeId) loadRule(selectedTypeId);
  }, [selectedTypeId, loadRule]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!form.name.trim()) {
      setError("Tên quy tắc là bắt buộc.");
      return;
    }
    if (form.has_depreciation && (!form.depreciation_rate || !form.depreciation_period)) {
      setError("Đã bật Khấu hao thì phải nhập Tỉ lệ khấu hao và Chu kỳ khấu hao.");
      return;
    }
    setSaving(true);
    const payload = {
      asset_type_id: selectedTypeId,
      name: form.name.trim(),
      default_value: Number(form.default_value) || 0,
      unit: form.unit.trim() || "VND",
      valuation_method: form.valuation_method,
      notes: form.notes.trim() || null,
      allow_override: form.allow_override,
      is_cumulative: form.is_cumulative,
      has_depreciation: form.has_depreciation,
      depreciation_rate: form.has_depreciation ? Number(form.depreciation_rate) : null,
      depreciation_period: form.has_depreciation ? form.depreciation_period : null,
    };
    const query = rule
      ? supabase.from("valuation_rules").update(payload).eq("id", rule.id)
      : supabase.from("valuation_rules").insert(payload);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    setSaved(true);
    loadRule(selectedTypeId);
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Quy tắc định giá</h1>
      </div>
      <p className="muted small">
        Mỗi loại tài sản có đúng 1 quy tắc định giá đang áp dụng — sửa ở đây, Engine tự tính lại NGAY cho mọi tài sản
        thuộc loại này, không cần thao tác gì thêm ở Sổ tài sản.
      </p>

      <label style={{ maxWidth: 420, display: "block", marginBottom: 20 }}>
        Loại tài sản
        <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.asset_categories?.name})
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <form className="form" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
          <div className="form-grid">
            <label>
              Tên quy tắc *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required disabled={!canEdit} />
            </label>
            <label>
              Đơn vị
              <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} disabled={!canEdit} />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Phương pháp định giá
              <select
                value={form.valuation_method}
                onChange={(e) => setForm((f) => ({ ...f, valuation_method: e.target.value }))}
                disabled={!canEdit}
              >
                <option value="fixed">Cố định (dùng thẳng EEV mặc định)</option>
                <option value="formula">Theo công thức (xem "Công thức tính")</option>
                <option value="manual">Thủ công (chỉ nhận Ghi đè, Engine không tự tính)</option>
              </select>
            </label>
            <label>
              EEV mặc định (Estimated Economic Value)
              <input
                type="number"
                step="0.01"
                value={form.default_value}
                onChange={(e) => setForm((f) => ({ ...f, default_value: e.target.value }))}
                disabled={!canEdit}
              />
            </label>
          </div>

          <label>
            Ghi chú
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={!canEdit} />
          </label>

          <div className="form-grid form-grid--3">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.allow_override}
                onChange={(e) => setForm((f) => ({ ...f, allow_override: e.target.checked }))}
                disabled={!canEdit}
              />
              Cho phép Ghi đè (mỗi tài sản có thể có giá trị riêng)
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.is_cumulative}
                onChange={(e) => setForm((f) => ({ ...f, is_cumulative: e.target.checked }))}
                disabled={!canEdit}
              />
              Có cộng dồn (giá trị tích luỹ theo mỗi lần cập nhật)
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.has_depreciation}
                onChange={(e) => setForm((f) => ({ ...f, has_depreciation: e.target.checked }))}
                disabled={!canEdit}
              />
              Có khấu hao
            </label>
          </div>

          {form.has_depreciation && (
            <div className="form-grid">
              <label>
                Tỉ lệ khấu hao (%/kỳ)
                <input
                  type="number"
                  step="0.01"
                  value={form.depreciation_rate}
                  onChange={(e) => setForm((f) => ({ ...f, depreciation_rate: e.target.value }))}
                  disabled={!canEdit}
                />
              </label>
              <label>
                Chu kỳ khấu hao
                <select
                  value={form.depreciation_period}
                  onChange={(e) => setForm((f) => ({ ...f, depreciation_period: e.target.value }))}
                  disabled={!canEdit}
                >
                  <option value="daily">Ngày</option>
                  <option value="weekly">Tuần</option>
                  <option value="monthly">Tháng</option>
                  <option value="yearly">Năm</option>
                </select>
              </label>
            </div>
          )}

          {error && <p className="field-error">{error}</p>}
          {saved && <p className="muted small">Đã lưu — Engine đã tính lại xong.</p>}
          {canEdit && (
            <div className="form-actions">
              <button type="submit" className="btn btn--solid" disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu quy tắc"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
