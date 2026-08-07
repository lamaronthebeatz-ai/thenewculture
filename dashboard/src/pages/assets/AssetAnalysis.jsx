import { useEffect, useState } from "react";
import { loadAnalysisInsights, formatVnd } from "../../lib/assetsData";

const COUNT_TYPES = new Set(["stale_items", "inactive_items"]);

// "Phân tích tài sản" (PHẦN XV spec) — Engine tự phân tích, hiển thị
// nguyên trạng jsonb trả về từ asset_analysis_insights() (Rev 19). "Không
// AI. Không API. Chỉ dùng dữ liệu." — trang này không gọi bất kỳ dịch vụ
// ngoài nào, chỉ 1 RPC duy nhất.
export default function AssetAnalysis() {
  const [phase, setPhase] = useState("loading");
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadAnalysisInsights()
      .then((data) => {
        if (cancelled) return;
        setInsights(data);
        setPhase("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page__header">
        <h1>Phân tích tài sản</h1>
      </div>
      <p className="muted small">Toàn bộ tính trực tiếp từ dữ liệu thật (Sổ tài sản + lịch sử) — không có số liệu giả định.</p>

      {phase === "loading" && <p className="muted">Đang tải…</p>}
      {phase === "error" && <p className="field-error">Không tải được: {error}</p>}
      {phase === "ready" && (
        <div className="asset-insights">
          {insights.map((ins) => (
            <div className="asset-insight-card" key={ins.type}>
              <div className="asset-insight-card__label">{ins.label}</div>
              {ins.detail && <div className="asset-insight-card__detail">{ins.detail}</div>}
              <div className="asset-insight-card__value">
                {COUNT_TYPES.has(ins.type) ? `${ins.value} tài sản` : formatVnd(ins.value)}
              </div>
            </div>
          ))}
          {insights.length === 0 && <p className="muted">Chưa đủ dữ liệu để phân tích.</p>}
        </div>
      )}
    </div>
  );
}
