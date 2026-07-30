import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

function Section({ title, table, rows, onChanged, canManage, extraFields, recordActivity }) {
  const [form, setForm] = useState({ name: "", slug: "", description: "", ...Object.fromEntries((extraFields || []).map((f) => [f.name, ""])) });
  const [creating, setCreating] = useState(false);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      description: form.description.trim() || null,
      sort_order: rows.length,
    };
    (extraFields || []).forEach((f) => {
      payload[f.name] = form[f.name] || null;
    });
    const { error: err } = await supabase.from(table).insert(payload);
    setCreating(false);
    if (err) return alert(`Không tạo được: ${err.message}`);
    recordActivity(`${table}.create`, table, null, { name: payload.name });
    setForm({ name: "", slug: "", description: "", ...Object.fromEntries((extraFields || []).map((f) => [f.name, ""])) });
    onChanged();
  }

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from(table).update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    recordActivity(next ? `${table}.delete` : `${table}.restore`, table, row.id);
    onChanged();
  }

  return (
    <div className="page__section" style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16 }}>{title}</h2>
      <table className="data-table data-table--compact" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Slug</th>
            {(extraFields || []).map((f) => (
              <th key={f.name}>{f.label}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.deleted_at ? "is-deleted" : ""}>
              <td>{row.name}</td>
              <td className="muted small">{row.slug}</td>
              {(extraFields || []).map((f) => (
                <td key={f.name}>{f.render ? f.render(row) : row[f.name] || "—"}</td>
              ))}
              <td>
                {canManage && (
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(row)}>
                    {row.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3 + (extraFields || []).length} className="muted">
                Chưa có dữ liệu.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <details>
          <summary>+ {title} mới</summary>
          <form className="form" onSubmit={create}>
            <div className="form-grid">
              <label>
                Tên
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label>
                Slug (để trống sẽ tự tạo)
                <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </label>
            </div>
            {(extraFields || []).map((f) => (
              <label key={f.name}>
                {f.label}
                {f.options ? (
                  <select value={form[f.name]} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={form[f.name]} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} />
                )}
              </label>
            ))}
            <label>
              Mô tả
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn--solid" disabled={creating}>
                {creating ? "Đang tạo…" : "Tạo mới"}
              </button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

export default function OrganizationManager() {
  const { hasPermission, recordActivity } = useAuth();
  const canManage = hasPermission("organization.manage");

  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let dq = supabase.from("departments").select("*").order("sort_order");
    let tq = supabase.from("teams").select("*, department:departments(name)").order("sort_order");
    let pq = supabase.from("positions").select("*").order("sort_order");
    if (!showDeleted) {
      dq = dq.is("deleted_at", null);
      tq = tq.is("deleted_at", null);
      pq = pq.is("deleted_at", null);
    }
    const [d, t, p] = await Promise.all([dq, tq, pq]);
    setDepartments(d.data || []);
    setTeams(t.data || []);
    setPositions(p.data || []);
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <div className="page__header">
        <h1>Organization</h1>
      </div>
      <label className="checkbox-inline" style={{ marginBottom: 16 }}>
        <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
        Hiện cả mục đã xoá
      </label>

      <Section title="Department" table="departments" rows={departments} onChanged={load} canManage={canManage} recordActivity={recordActivity} />
      <Section
        title="Team"
        table="teams"
        rows={teams}
        onChanged={load}
        canManage={canManage}
        recordActivity={recordActivity}
        extraFields={[
          {
            name: "department_id",
            label: "Department",
            options: departments,
            render: (row) => row.department?.name || "—",
          },
        ]}
      />
      <Section title="Position" table="positions" rows={positions} onChanged={load} canManage={canManage} recordActivity={recordActivity} />
    </div>
  );
}
