import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { roleLabel } from "../lib/editorRegistries";

export default function AuthorsList() {
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("authors")
      .select("id, slug, name, email, role, is_active, deleted_at")
      .order("name");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setAuthors([]);
    } else {
      setAuthors(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("authors").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  const filtered = authors.filter((a) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <div className="page__header">
        <h1>Authors</h1>
        <Link className="btn btn--solid" to="/authors/new">
          + Author mới
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Tìm theo tên hoặc slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả author đã xoá
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Đang hoạt động</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className={a.deleted_at ? "is-deleted" : ""}>
                <td>
                  <Link to={`/authors/${a.id}`}>{a.name}</Link>
                  <div className="muted small">{a.slug}</div>
                </td>
                <td>{a.email || "—"}</td>
                <td>{roleLabel(a.role)}</td>
                <td>{a.is_active ? "Có" : "Không"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(a)}>
                    {a.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Không có author nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
