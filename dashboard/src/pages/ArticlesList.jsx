import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useInspector } from "../layout/InspectorContext";
import { buildArticleInspectorContent } from "../components/ArticleInspector";

const STATUS_LABELS = {
  draft: "Nháp",
  review: "Chờ duyệt",
  scheduled: "Đã lên lịch",
  published: "Đã đăng",
  archived: "Lưu trữ",
};

export default function ArticlesList() {
  const { open: openInspector } = useInspector();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("articles")
      // authors!articles_author_id_fkey — Rev 15 (v2.2) thêm owner_id (cũng tham chiếu
      // authors) khiến articles có 2 FK tới authors; embed ngầm định
      // "authors(name)" trở nên mơ hồ (PostgREST trả lỗi "more than one
      // relationship was found") nếu không chỉ rõ đi qua cột nào.
      .select("id, slug, title, status, sort_order, published_at, deleted_at, authors!articles_author_id_fkey(name), series(name)")
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true });

    if (!showDeleted) query = query.is("deleted_at", null);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setArticles([]);
    } else {
      setArticles(data);
    }
    setLoading(false);
  }, [statusFilter, showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDeleted(article) {
    const next = article.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase
      .from("articles")
      .update({ deleted_at: next })
      .eq("id", article.id);
    if (err) {
      alert(`Không thực hiện được: ${err.message}`);
      return;
    }
    load();
  }

  const filtered = articles.filter((a) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return a.title.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <div className="page__header">
        <h1>Articles</h1>
        <Link className="btn btn--solid" to="/articles/new">
          + Bài viết mới
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          aria-label="Tìm theo tiêu đề hoặc slug"
          placeholder="Tìm theo tiêu đề hoặc slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          Hiện cả bài đã xoá
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Thứ tự</th>
              <th>Tiêu đề</th>
              <th>Tác giả</th>
              <th>Series</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className={a.deleted_at ? "is-deleted" : ""}>
                <td>{a.sort_order}</td>
                <td>
                  <Link to={`/articles/${a.id}`}>{a.title}</Link>
                  <div className="muted small">{a.slug}</div>
                </td>
                <td>{a.authors?.name || "—"}</td>
                <td>{a.series?.name || "—"}</td>
                <td>
                  <span className={`badge badge--${a.status}`}>{STATUS_LABELS[a.status] || a.status}</span>
                  {a.deleted_at && <span className="badge badge--deleted">Đã xoá</span>}
                </td>
                <td className="table-actions">
                  <button className="tncos-btn tncos-btn--ghost tncos-btn--sm" onClick={() => openInspector(buildArticleInspectorContent(a))}>
                    Inspect
                  </button>
                  <button className="tncos-btn tncos-btn--ghost tncos-btn--sm" onClick={() => toggleDeleted(a)}>
                    {a.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Không có bài viết nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
