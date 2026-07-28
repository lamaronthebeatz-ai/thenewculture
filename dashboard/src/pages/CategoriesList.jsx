import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function CategoriesList() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("categories")
      .select("id, slug, name, sort_order, deleted_at, parent:parent_id(name)")
      .order("sort_order");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setCategories([]);
    } else {
      setCategories(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("categories").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Categories</h1>
        <Link className="btn btn--solid" to="/categories/new">
          + Category mới
        </Link>
      </div>

      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả category đã xoá
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
              <th>Tên</th>
              <th>Danh mục cha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className={c.deleted_at ? "is-deleted" : ""}>
                <td>{c.sort_order}</td>
                <td>
                  <Link to={`/categories/${c.id}`}>{c.name}</Link>
                  <div className="muted small">{c.slug}</div>
                </td>
                <td>{c.parent?.name || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(c)}>
                    {c.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có category nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
