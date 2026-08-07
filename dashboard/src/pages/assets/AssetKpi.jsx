import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadCategoriesForSelect, loadTypesForSelect, formatVnd } from "../../lib/assetsData";
import { Progress } from "../../components/ui";

const EMPTY_FORM = { name: "", metric_type: "count_total", target_value: "", target_type_id: "", target_category_id: "", period: "all_time" };

const METRIC_LABEL = {
  count_total: "Tổng số tài sản",
  count_by_type: "Số tài sản theo loại",
  count_by_category: "Số tài sản theo danh mục",
  total_value: "Tổng giá trị",
};

// "KPI" (PHẦN XIV spec) — CHỈ nhập MỤC TIÊU (target_value). "Đã đạt bao
// nhiêu" luôn gọi asset_kpi_progress() (Rev 19) — không có cột kết quả nào
// để nhập tay, đúng yêu cầu "KPI KHÔNG được nhập kết quả".
export default function AssetKpi() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("assets.create");
  const canEdit = hasPermission("assets.edit");
  const canDelete = hasPermission("assets.delete");

  const [kpis, setKpis] = useState([]);
  const [progress, setProgress] = useState({});
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [kpiRes, cats, typesList] = await Promise.all([
      supabase.from("asset_kpi").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      loadCategoriesForSelect(),
      loadTypesForSelect(),
    ]);
    if (kpiRes.error) {
      setError(kpiRes.error.message);
      setKpis([]);
    } else {
      setKpis(kpiRes.data);
      const progressEntries = await Promise.all(
        kpiRes.data.map(async (k) => {
          const { data } = await supabase.rpc("asset_kpi_progress", { p_kpi_id: k.id });
          return [k.id, data ?? 0];
        })
      );
      setProgress(Object.fromEntries(progressEntries));
    }
    setCategories(cats);
    setTypes(typesList);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId("__new__");
    setForm(EMPTY_FORM);
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || form.target_value === "") {
      setError("Tên KPI và Mục tiêu là bắt buộc.");
      return;
    }
    if (form.metric_type === "count_by_type" && !form.target_type_id) {
      setError('Metric "Số tài sản theo loại" phải chọn Loại tài sản.');
      return;
    }
    if (form.metric_type === "count_by_category" && !form.target_category_id) {
      setError('Metric "Số tài sản theo danh mục" phải chọn Danh mục.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from("asset_kpi").insert({
      name: form.name.trim(),
      metric_type: form.metric_type,
      target_value: Number(form.target_value),
      target_type_id: form.metric_type === "count_by_type" ? form.target_type_id : null,
      target_category_id: form.metric_type === "count_by_category" ? form.target_category_id : null,
      period: form.period,
    });
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function softDelete(row) {
    if (!confirm(`Xoá KPI "${row.name}"?`)) return;
    const { error: err } = await supabase.from("asset_kpi").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>KPI</h1>
        {canCreate && editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Thêm KPI
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24, maxWidth: 640 }}>
          <div className="form-grid">
            <label>
              Tên KPI *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="vd: 500 bài viết" required />
            </label>
            <label>
              Mục tiêu *
              <input
                type="number"
                step="0.01"
                value={form.target_value}
                onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Đo theo
              <select value={form.metric_type} onChange={(e) => setForm((f) => ({ ...f, metric_type: e.target.value }))}>
                {Object.entries(METRIC_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kỳ
              <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                <option value="all_time">Toàn thời gian</option>
                <option value="yearly">Theo năm</option>
                <option value="monthly">Theo tháng</option>
                <option value="weekly">Theo tuần</option>
              </select>
            </label>
          </div>
          {form.metric_type === "count_by_type" && (
            <label>
              Loại tài sản
              <select value={form.target_type_id} onChange={(e) => setForm((f) => ({ ...f, target_type_id: e.target.value }))}>
                <option value="">— Chọn loại tài sản —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {form.metric_type === "count_by_category" && (
            <label>
              Danh mục
              <select value={form.target_category_id} onChange={(e) => setForm((f) => ({ ...f, target_category_id: e.target.value }))}>
                <option value="">— Chọn danh mục —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        <>
          {kpis.map((k) => {
            const achieved = progress[k.id] ?? 0;
            const isCurrency = k.metric_type === "total_value";
            return (
              <div className="asset-kpi-card" key={k.id}>
                <div className="asset-kpi-card__head">
                  <strong>{k.name}</strong>
                  {canDelete && (
                    <button className="btn btn--ghost btn--sm" onClick={() => softDelete(k)}>
                      Xoá
                    </button>
                  )}
                </div>
                <Progress value={achieved} max={Number(k.target_value) || 1} label={k.name} />
                <div className="asset-kpi-card__progress-label">
                  Đã đạt: <strong>{isCurrency ? formatVnd(achieved) : achieved}</strong> / Mục tiêu:{" "}
                  {isCurrency ? formatVnd(k.target_value) : k.target_value} ({METRIC_LABEL[k.metric_type]})
                </div>
              </div>
            );
          })}
          {kpis.length === 0 && <p className="muted">Chưa có KPI nào.</p>}
        </>
      )}
    </div>
  );
}
