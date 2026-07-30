import { Link } from "react-router-dom";
import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";
import { formatRelative } from "../../lib/format";

// TNCOS Home — "Continue Working" + "Recent Draft" gộp làm 1 card (cùng
// khái niệm: nội dung CỦA CHÍNH MÌNH đang dang dở) — lọc client-side từ
// recentArticles đã tải sẵn (Promise.allSettled trong dashboardData.js,
// KHÔNG gọi thêm query nào), so theo tên tác giả khớp editorProfile.name
// (dữ liệu recentArticles hiện chỉ có authors(name), không có id — khớp
// theo tên là cách khả thi duy nhất mà không phải đổi shape query hiện có).
export default function ContinueWorkingCard({ status, articles, editorName }) {
  const mine = (articles || []).filter((a) => a.authors?.name === editorName && a.status !== "published" && a.status !== "archived");

  return (
    <DashboardCard title="Continue Working">
      {status === "loading" && (
        <div className="skeleton-rows">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} height="1.4rem" />
          ))}
        </div>
      )}
      {status === "error" && <p className="field-error">Không tải được dữ liệu.</p>}
      {status === "ok" && mine.length === 0 && (
        <p className="muted small">
          Không có bài viết dang dở nào của bạn trong 10 bài cập nhật gần nhất.{" "}
          <Link to="/articles/new">Tạo bài mới</Link>.
        </p>
      )}
      {status === "ok" && mine.length > 0 && (
        <ul className="continue-working__list">
          {mine.map((a) => (
            <li key={a.id}>
              <Link to={`/articles/${a.id}`}>{a.title}</Link>
              <span className="muted small">
                {a.status} · {formatRelative(a.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
