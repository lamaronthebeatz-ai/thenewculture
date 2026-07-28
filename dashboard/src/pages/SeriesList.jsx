import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function SeriesList() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("series")
      .select("id, slug, code, name, sort_order, deleted_at")
      .order("sort_order");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setSeries([]);
    } else {
      setSeries(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("series").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Series</h1>
        <Link className="btn btn--solid" to="/series/new">
          + Series mới
        </Link>
      </div>

      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả series đã xoá
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
              <th>Mã</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id} className={s.deleted_at ? "is-deleted" : ""}>
                <td>{s.sort_order}</td>
                <td>
                  <Link to={`/series/${s.id}`}>{s.name}</Link>
                  <div className="muted small">{s.slug}</div>
                </td>
                <td>{s.code || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(s)}>
                    {s.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {series.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có series nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
