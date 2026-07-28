import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";
import { ARTICLE_STATUSES } from "../../lib/dashboardData";

const STATUS_LABELS = {
  draft: "Draft",
  review: "Review",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

const STATUS_COLORS = {
  draft: "#8A9BA8",
  review: "#E8A33D",
  scheduled: "#3B82F6",
  published: "#2f9e44",
  archived: "#B8BCC4",
};

export default function PublishingOverviewCard({ status, statusCounts }) {
  const total = statusCounts ? ARTICLE_STATUSES.reduce((sum, s) => sum + statusCounts[s], 0) : 0;

  return (
    <DashboardCard title="Publishing Overview">
      {status === "loading" && (
        <div className="skeleton-rows">
          {ARTICLE_STATUSES.map((s) => (
            <Skeleton key={s} height="1.6rem" />
          ))}
        </div>
      )}
      {status === "error" && <p className="field-error">Không tải được dữ liệu.</p>}
      {status === "ok" && total === 0 && <p className="muted">Chưa có bài viết nào.</p>}
      {status === "ok" && total > 0 && (
        <div className="publishing-overview">
          {ARTICLE_STATUSES.map((s) => {
            const count = statusCounts[s];
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={s} className="publishing-overview__row">
                <div className="publishing-overview__label">
                  <span>{STATUS_LABELS[s]}</span>
                  <span className="muted">{count}</span>
                </div>
                <div className="publishing-overview__track">
                  <div
                    className="publishing-overview__bar"
                    style={{ width: `${pct}%`, background: STATUS_COLORS[s] }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
