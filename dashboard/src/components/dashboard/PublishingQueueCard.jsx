import { Link } from "react-router-dom";
import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";
import { formatDateTime, formatRelative } from "../../lib/format";

// TNCOS Home — "Publishing Queue" + "Upcoming Schedule" gộp 1 card: bài
// đang chờ duyệt (review) hoặc đã lên lịch (scheduled), sắp theo
// published_at nếu có (ngày sẽ lên) rồi tới updated_at. Lọc client-side từ
// recentArticles đã tải sẵn — không thêm query mới.
export default function PublishingQueueCard({ status, articles }) {
  const queue = (articles || [])
    .filter((a) => a.status === "review" || a.status === "scheduled")
    .sort((a, b) => new Date(a.published_at || a.updated_at) - new Date(b.published_at || b.updated_at));

  return (
    <DashboardCard
      title="Publishing Queue"
      action={
        <Link to="/articles" className="tncos-btn tncos-btn--ghost tncos-btn--sm">
          View All
        </Link>
      }
    >
      {status === "loading" && (
        <div className="skeleton-rows">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} height="1.4rem" />
          ))}
        </div>
      )}
      {status === "error" && <p className="field-error">Không tải được dữ liệu.</p>}
      {status === "ok" && queue.length === 0 && <p className="muted small">Không có bài nào đang chờ duyệt/lên lịch.</p>}
      {status === "ok" && queue.length > 0 && (
        <ul className="publishing-queue__list">
          {queue.map((a) => (
            <li key={a.id}>
              <div>
                <Link to={`/articles/${a.id}`}>{a.title}</Link>
                <div className="muted small">{a.authors?.name || "—"}</div>
              </div>
              <div className="publishing-queue__meta">
                <span className={`badge badge--${a.status}`}>{a.status === "review" ? "Chờ duyệt" : "Đã lên lịch"}</span>
                <span className="muted small">{a.published_at ? formatDateTime(a.published_at) : formatRelative(a.updated_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
