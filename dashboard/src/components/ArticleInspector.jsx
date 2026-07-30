import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatDateTime } from "../lib/format";

// TNCOS Inspector — nội dung cụ thể cho module Articles (flagship demo của
// Inspector panel, xem layout/InspectorPanel.jsx). Metadata/SEO/Publish/
// Properties dùng lại đúng dữ liệu ArticlesList đã tải (không query thêm);
// History là query mới duy nhất (activity_log lọc theo target_id — RLS tự
// áp dụng như mọi nơi khác, không có luồng phân quyền riêng).
function HistoryTab({ articleId }) {
  const [status, setStatus] = useState("loading");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("activity_log")
      .select("id, action, actor_email, created_at")
      .eq("target_type", "articles")
      .eq("target_id", articleId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        setRows(data || []);
        setStatus("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (status === "loading") return <p className="muted small">Đang tải…</p>;
  if (status === "error") return <p className="field-error">Không tải được lịch sử.</p>;
  if (rows.length === 0) return <p className="muted small">Chưa có hoạt động nào được ghi nhận cho bài viết này.</p>;

  return (
    <ul className="notifications__list">
      {rows.map((r) => (
        <li key={r.id}>
          <span>
            {r.action}
            {r.actor_email && <span className="muted small"> · {r.actor_email}</span>}
          </span>
          <span className="muted small">{formatDateTime(r.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function buildArticleInspectorContent(article) {
  return {
    title: article.title,
    tabs: [
      {
        key: "metadata",
        label: "Metadata",
        content: (
          <dl className="inspector-dl">
            <dt>Slug</dt>
            <dd>{article.slug}</dd>
            <dt>Tác giả</dt>
            <dd>{article.authors?.name || "—"}</dd>
            <dt>Series</dt>
            <dd>{article.series?.name || "—"}</dd>
            <dt>Thứ tự hiển thị</dt>
            <dd>{article.sort_order}</dd>
          </dl>
        ),
      },
      {
        key: "seo",
        label: "SEO",
        content: (
          <dl className="inspector-dl">
            <dt>URL công khai</dt>
            <dd>/{article.slug}.html</dd>
            <dt>Tiêu đề</dt>
            <dd>{article.title}</dd>
          </dl>
        ),
      },
      { key: "history", label: "History", content: <HistoryTab articleId={article.id} /> },
      {
        key: "publish",
        label: "Publish",
        content: (
          <dl className="inspector-dl">
            <dt>Trạng thái</dt>
            <dd>{article.status}</dd>
            <dt>Ngày đăng</dt>
            <dd>{article.published_at ? formatDateTime(article.published_at) : "—"}</dd>
          </dl>
        ),
      },
      {
        key: "properties",
        label: "Properties",
        content: (
          <dl className="inspector-dl">
            <dt>Đã xoá (soft delete)</dt>
            <dd>{article.deleted_at ? formatDateTime(article.deleted_at) : "Không"}</dd>
          </dl>
        ),
      },
    ],
  };
}
