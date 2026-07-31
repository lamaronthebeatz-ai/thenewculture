import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { formatDateTime, formatRelative } from "../lib/format";
import { useAuth } from "../auth/AuthContext";

const PAGE_SIZE = 20;

export default function UsersList() {
  const { hasPermission, recordActivity } = useAuth();
  const canEdit = hasPermission("users.edit") || hasPermission("users.manage");
  const canDelete = hasPermission("users.delete") || hasPermission("users.manage");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("dashboard_users")
      .select(
        // roles!dashboard_users_role_id_fkey — Rev 15 (v2.2) thêm bảng
        // user_roles (multi-role) tạo thêm 1 đường quan hệ nhiều-nhiều giữa
        // dashboard_users và roles, khiến embed ngầm định "roles(id, name)"
        // trở nên mơ hồ (PostgREST: "more than one relationship was found")
        // — chỉ rõ đi qua FK role_id (cột chính, không phải qua user_roles).
        "id, username, display_name, avatar_url, email, status, provider, last_login_at, created_at, deleted_at, role:roles!dashboard_users_role_id_fkey(id, name), department:departments(name), team:teams(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (!showDeleted) query = query.is("deleted_at", null);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (search.trim()) {
      // Loại bỏ ',', '(', ')' — ký tự có ý nghĩa cú pháp trong filter string
      // của PostgREST .or() — để tránh người dùng vô tình/cố ý phá vỡ cấu
      // trúc filter (RLS vẫn luôn chặn dữ liệu ngoài phạm vi được xem, đây
      // chỉ là làm sạch input cho đúng ý định "tìm kiếm").
      const q = search.trim().replace(/[,()]/g, "");
      query = query.or(`email.ilike.%${q}%,display_name.ilike.%${q}%,username.ilike.%${q}%`);
    }
    const { data, error: err, count } = await query;
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, showDeleted, statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, showDeleted]);

  async function toggleStatus(row) {
    const next = row.status === "active" ? "inactive" : "active";
    const { error: err } = await supabase.from("dashboard_users").update({ status: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    recordActivity(next === "active" ? "user.activate" : "user.deactivate", "dashboard_users", row.id);
    load();
  }

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("dashboard_users").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    recordActivity(next ? "user.delete" : "user.restore", "dashboard_users", row.id);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page__header">
        <h1>Users</h1>
        {hasPermission("users.create") && (
          <Link className="btn btn--solid" to="/users/new">
            + User mới
          </Link>
        )}
      </div>

      <div className="toolbar">
        <input
          type="search"
          aria-label="Tìm theo email/tên/username"
          placeholder="Tìm theo email, tên hiển thị hoặc username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã vô hiệu hoá</option>
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả user đã xoá
        </label>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Tổ chức</th>
                <th>Trạng thái</th>
                <th>Provider</th>
                <th>Đăng nhập gần nhất</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.deleted_at ? "is-deleted" : ""}>
                  <td>
                    {canEdit ? <Link to={`/users/${u.id}`}>{u.display_name || u.username || u.email}</Link> : (u.display_name || u.username || u.email)}
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>{u.role?.name || "—"}</td>
                  <td>{[u.department?.name, u.team?.name].filter(Boolean).join(" / ") || "—"}</td>
                  <td>{u.status === "active" ? "Đang hoạt động" : "Đã vô hiệu hoá"}</td>
                  <td>{u.provider}</td>
                  <td title={formatDateTime(u.last_login_at)}>{u.last_login_at ? formatRelative(u.last_login_at) : "Chưa từng"}</td>
                  <td className="table-actions">
                    {canEdit && (
                      <button className="btn btn--ghost btn--sm" onClick={() => toggleStatus(u)}>
                        {u.status === "active" ? "Vô hiệu hoá" : "Kích hoạt lại"}
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(u)}>
                        {u.deleted_at ? "Khôi phục" : "Xoá"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Không có user nào khớp bộ lọc.
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
              Trang {page + 1}/{totalPages} — {total} user
            </span>
            <button
              className="btn btn--ghost btn--sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Trang sau →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
