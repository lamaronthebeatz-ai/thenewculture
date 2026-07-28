import Skeleton from "../Skeleton";

// status: "loading" | "error" | "coming-soon" | "ok"
export default function KpiCard({ label, status, value }) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__label">{label}</div>
      {status === "loading" && <Skeleton width="3.5rem" height="1.9rem" />}
      {status === "error" && <div className="kpi-card__value kpi-card__value--error">—</div>}
      {status === "coming-soon" && <div className="kpi-card__soon">Coming Soon</div>}
      {status === "ok" && <div className="kpi-card__value">{value}</div>}
    </div>
  );
}
