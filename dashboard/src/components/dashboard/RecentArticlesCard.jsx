import { Link } from "react-router-dom";
import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";
import { formatRelative } from "../../lib/format";

const STATUS_LABELS = {
  draft: "Nháp",
  review: "Chờ duyệt",
  scheduled: "Đã lên lịch",
  published: "Đã đăng",
  archived: "Lưu trữ",
};

export default function RecentArticlesCard({ status, articles }) {
  return (
    <DashboardCard
      title="Recent Articles"
      action={
        <Link to="/articles" className="btn btn--ghost btn--sm">
          View All
        </Link>
      }
    >
      {status === "loading" && (
        <div className="skeleton-rows">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} height="1.4rem" />
          ))}
        </div>
      )}
      {status === "error" && <p className="field-error">Không tải được danh sách bài viết.</p>}
      {status === "ok" && articles.length === 0 && <p className="muted">Chưa có bài viết nào.</p>}
      {status === "ok" && articles.length > 0 && (
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Series</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/articles/${a.id}`}>{a.title}</Link>
                </td>
                <td>{a.authors?.name || "—"}</td>
                <td>{a.series?.name || "—"}</td>
                <td>
                  <span className={`badge badge--${a.status}`}>{STATUS_LABELS[a.status] || a.status}</span>
                </td>
                <td className="muted small">{formatRelative(a.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  );
}
