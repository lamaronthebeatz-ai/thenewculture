import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function MediaList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("media")
      .select("id, url, type, alt_text, deleted_at, authors(name), articles(slug)")
      .order("created_at", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    if (typeFilter !== "all") query = query.eq("type", typeFilter);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setItems([]);
    } else {
      setItems(data);
    }
    setLoading(false);
  }, [typeFilter, showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("media").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Media</h1>
        <Link className="btn btn--solid" to="/media/new">
          + Media mới
        </Link>
      </div>

      <div className="toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Tất cả loại</option>
          <option value="image">image</option>
          <option value="gif">gif</option>
          <option value="video">video</option>
          <option value="audio">audio</option>
          <option value="document">document</option>
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả media đã xoá
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Xem trước</th>
              <th>URL</th>
              <th>Loại</th>
              <th>Người upload</th>
              <th>Gắn với bài viết</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className={m.deleted_at ? "is-deleted" : ""}>
                <td>
                  {(m.type === "image" || m.type === "gif") && (
                    <img src={m.url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                  )}
                </td>
                <td>
                  <Link to={`/media/${m.id}`} className="muted small">
                    {m.url}
                  </Link>
                </td>
                <td>{m.type}</td>
                <td>{m.authors?.name || "—"}</td>
                <td>{m.articles?.slug || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(m)}>
                    {m.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Chưa có media nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
