import { useEffect, useState } from "react";
import { loadOverviewStats, formatVnd, formatSignedVnd } from "../../lib/assetsData";
import GrowthChart from "../../components/assets/GrowthChart";
import DistributionBars from "../../components/assets/DistributionBars";
import DashboardCard from "../../components/dashboard/DashboardCard";

function deltaClass(v) {
  if (v > 0) return "asset-stat-delta asset-stat-delta--up";
  if (v < 0) return "asset-stat-delta asset-stat-delta--down";
  return "asset-stat-delta asset-stat-delta--flat";
}

// "Tổng quan tài sản" (PHẦN XIII spec) — TOÀN BỘ số liệu ở trang này đọc từ
// RPC do Valuation Engine tính sẵn trong Postgres (asset_total_value/
// asset_value_delta/asset_growth_series/asset_distribution_by_category/
// asset_top_*, xem database/migrate_rev19_asset_management.sql) — Dashboard
// KHÔNG cộng/trừ/tính lại bất cứ gì, đúng yêu cầu "Không nhập tay".
export default function AssetOverview() {
  const [phase, setPhase] = useState("loading");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadOverviewStats()
      .then((data) => {
        if (cancelled) return;
        setStats(data);
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

  if (phase === "loading") return <div className="page">Đang tải…</div>;
  if (phase === "error") return <div className="page field-error">Không tải được: {error}</div>;

  return (
    <div className="page page--wide">
      <div className="page__header">
        <h1>Tổng quan tài sản</h1>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card__label">Tổng giá trị tài sản</div>
          <div className="kpi-card__value">{formatVnd(stats.totalValue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__label">Hôm nay</div>
          <div className={deltaClass(stats.deltaToday)}>{formatSignedVnd(stats.deltaToday)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__label">Tuần này</div>
          <div className={deltaClass(stats.deltaWeek)}>{formatSignedVnd(stats.deltaWeek)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__label">Tháng này</div>
          <div className={deltaClass(stats.deltaMonth)}>{formatSignedVnd(stats.deltaMonth)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card__label">Năm nay</div>
          <div className={deltaClass(stats.deltaYear)}>{formatSignedVnd(stats.deltaYear)}</div>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="dashboard-columns__main">
          <DashboardCard title="Biểu đồ tăng trưởng (30 ngày)">
            <GrowthChart data={stats.growthSeries} />
          </DashboardCard>
          <DashboardCard title="Biểu đồ phân bố theo Danh mục">
            <DistributionBars data={stats.distribution} />
          </DashboardCard>
        </div>
        <div className="dashboard-columns__side">
          <DashboardCard title="Top tài sản">
            <ul className="asset-top-list">
              {stats.topItems.map((it) => (
                <li key={it.id}>
                  <span>
                    {it.name} <span className="muted small">({it.type_name})</span>
                  </span>
                  <span className="value">{formatVnd(it.effective_value)}</span>
                </li>
              ))}
              {stats.topItems.length === 0 && <li className="muted">Chưa có tài sản nào.</li>}
            </ul>
          </DashboardCard>
          <DashboardCard title="Top danh mục">
            <ul className="asset-top-list">
              {stats.topCategories.map((c) => (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <span className="value">{formatVnd(c.total_value)}</span>
                </li>
              ))}
              {stats.topCategories.length === 0 && <li className="muted">Chưa có dữ liệu.</li>}
            </ul>
          </DashboardCard>
          <DashboardCard title="Top loại tài sản">
            <ul className="asset-top-list">
              {stats.topTypes.map((t) => (
                <li key={t.id}>
                  <span>{t.name}</span>
                  <span className="value">{formatVnd(t.total_value)}</span>
                </li>
              ))}
              {stats.topTypes.length === 0 && <li className="muted">Chưa có dữ liệu.</li>}
            </ul>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
