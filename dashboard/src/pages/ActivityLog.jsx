import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatDateTime } from "../lib/format";
import { useAuth } from "../auth/AuthContext";

const PAGE_SIZE = 30;

export default function ActivityLog() {
  const { hasPermission } = useAuth();
  const canViewAll = hasPermission("system.view");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("activity_log")
      .select("id, actor_email, action, target_type, target_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (actionFilter.trim()) query = query.ilike("action", `%${actionFilter.trim()}%`);
    const { data, error: err, count } = await query;
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, actionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page__header">
        <h1>Activity Log</h1>
      </div>
      {!canViewAll && (
        <p className="muted small">Bạn chỉ xem được nhật ký hoạt động của chính mình (cần quyền system.view để xem toàn bộ).</p>
      )}

      <div className="toolbar">
        <input
          type="search"
          aria-label="Lọc theo action"
          placeholder="Lọc theo action (vd: login, article.publish)…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người thực hiện</th>
                <th>Action</th>
                <th>Đối tượng</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.actor_email || "—"}</td>
                  <td>{row.action}</td>
                  <td className="muted small">{[row.target_type, row.target_id].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="muted small">{row.metadata && Object.keys(row.metadata).length ? JSON.stringify(row.metadata) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Không có bản ghi nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="toolbar">
            <button className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Trang trước
            </button>
            <span className="muted small">
              Trang {page + 1}/{totalPages} — {total} bản ghi
            </span>
            <button className="btn btn--ghost btn--sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Trang sau →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
