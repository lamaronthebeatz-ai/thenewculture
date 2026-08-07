import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadOverviewStats, formatVnd } from "../../lib/assetsData";
import { exportCsv, exportXlsx } from "../../lib/assetExport";

const REPORT_TYPE_LABEL = {
  overview: "Tổng quan tài sản",
  ledger: "Sổ tài sản (lịch sử)",
  kpi: "KPI",
  items: "Danh sách tài sản",
};

async function buildReportRows(reportType) {
  if (reportType === "overview") {
    const s = await loadOverviewStats();
    const headers = [
      { key: "metric", label: "Chỉ số" },
      { key: "value", label: "Giá trị" },
    ];
    const rows = [
      { metric: "Tổng giá trị tài sản", value: formatVnd(s.totalValue) },
      { metric: "Tăng hôm nay", value: formatVnd(s.deltaToday) },
      { metric: "Tăng tuần này", value: formatVnd(s.deltaWeek) },
      { metric: "Tăng tháng này", value: formatVnd(s.deltaMonth) },
      { metric: "Tăng năm nay", value: formatVnd(s.deltaYear) },
    ];
    return { headers, rows };
  }
  if (reportType === "ledger") {
    const { data, error } = await supabase
      .from("asset_ledger")
      .select("changed_at, reason, old_value, new_value, asset_items(name)")
      .order("changed_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const headers = [
      { key: "date", label: "Ngày" },
      { key: "name", label: "Tài sản" },
      { key: "reason", label: "Lý do" },
      { key: "old_value", label: "Giá trị cũ" },
      { key: "new_value", label: "Giá trị mới" },
    ];
    const rows = (data || []).map((r) => ({
      date: new Date(r.changed_at).toLocaleString("vi-VN"),
      name: r.asset_items?.name || "—",
      reason: r.reason,
      old_value: formatVnd(r.old_value),
      new_value: formatVnd(r.new_value),
    }));
    return { headers, rows };
  }
  if (reportType === "kpi") {
    const { data, error } = await supabase.from("asset_kpi").select("*").is("deleted_at", null);
    if (error) throw error;
    const rowsRaw = await Promise.all(
      (data || []).map(async (k) => {
        const { data: achieved } = await supabase.rpc("asset_kpi_progress", { p_kpi_id: k.id });
        return { name: k.name, metric_type: k.metric_type, target_value: formatVnd(k.target_value), achieved: formatVnd(achieved) };
      })
    );
    const headers = [
      { key: "name", label: "Tên KPI" },
      { key: "metric_type", label: "Đo theo" },
      { key: "target_value", label: "Mục tiêu" },
      { key: "achieved", label: "Đã đạt" },
    ];
    return { headers, rows: rowsRaw };
  }
  // items
  const { data, error } = await supabase
    .from("asset_items")
    .select("name, base_value, effective_value, is_active, asset_types(name, asset_categories(name))")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const headers = [
    { key: "name", label: "Tên tài sản" },
    { key: "type_name", label: "Loại" },
    { key: "category_name", label: "Danh mục" },
    { key: "base_value", label: "Giá trị cơ bản" },
    { key: "effective_value", label: "Giá trị hiệu lực" },
    { key: "is_active", label: "Đang sử dụng" },
  ];
  const rows = (data || []).map((r) => ({
    name: r.name,
    type_name: r.asset_types?.name || "—",
    category_name: r.asset_types?.asset_categories?.name || "—",
    base_value: formatVnd(r.base_value),
    effective_value: formatVnd(r.effective_value),
    is_active: r.is_active ? "Có" : "Không",
  }));
  return { headers, rows };
}

// "Báo cáo" (PHẦN XVI spec) — xuất PDF/Excel/CSV. Mỗi lần xuất tự ghi 1
// dòng vào asset_reports (audit trail, xem Rev 19) — không lưu nội dung
// file, chỉ ai/khi nào/xuất gì.
export default function AssetReports() {
  const { hasPermission, session } = useAuth();
  const canView = hasPermission("assets.view");

  const [reportType, setReportType] = useState("overview");
  const [format, setFormat] = useState("csv");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setBusy(true);
    try {
      const { headers, rows } = await buildReportRows(reportType);
      setPreview({ headers, rows });

      const filename = `tnc-tai-san-${reportType}-${new Date().toISOString().slice(0, 10)}`;
      if (format === "csv") {
        exportCsv(`${filename}.csv`, headers, rows);
      } else if (format === "excel") {
        exportXlsx(`${filename}.xlsx`, REPORT_TYPE_LABEL[reportType], headers, rows);
      } else {
        // PDF: bản xem trước hiện sẵn trong .asset-report-preview, in qua
        // trình duyệt (Lưu dưới dạng PDF) — không thêm thư viện PDF.
        setTimeout(() => window.print(), 150);
      }

      await supabase.from("asset_reports").insert({
        report_type: reportType,
        format,
        row_count: rows.length,
        generated_by: session?.user?.id || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="page">
        <p className="muted">Bạn không có quyền xem Báo cáo.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Báo cáo</h1>
      </div>

      <div className="form-grid" style={{ maxWidth: 640 }}>
        <label>
          Loại báo cáo
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {Object.entries(REPORT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Định dạng
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="csv">CSV</option>
            <option value="excel">Excel</option>
            <option value="pdf">PDF (in từ trình duyệt)</option>
          </select>
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button className="btn btn--solid" onClick={handleExport} disabled={busy}>
          {busy ? "Đang tạo báo cáo…" : "Xuất báo cáo"}
        </button>
      </div>

      {preview && (
        <div className="asset-report-preview">
          <table className="data-table">
            <thead>
              <tr>
                {preview.headers.map((h) => (
                  <th key={h.key}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr key={i}>
                  {preview.headers.map((h) => (
                    <td key={h.key}>{row[h.key]}</td>
                  ))}
                </tr>
              ))}
              {preview.rows.length === 0 && (
                <tr>
                  <td colSpan={preview.headers.length} className="muted">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
