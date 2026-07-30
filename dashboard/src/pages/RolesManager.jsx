import { useEffect, useState, useCallback, Fragment } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

const SCOPE_OPTIONS = [
  { value: "own", label: "Own — chỉ của mình" },
  { value: "assigned", label: "Assigned — được gán" },
  { value: "team", label: "Team" },
  { value: "department", label: "Department" },
  { value: "all", label: "All — toàn bộ" },
];

export default function RolesManager() {
  const { hasPermission, recordActivity } = useAuth();
  const canManage = hasPermission("roles.manage");

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [grants, setGrants] = useState(new Set()); // "roleId:permId"
  const [scopes, setScopes] = useState(new Map()); // "roleId:permId" -> scope
  const [scopeModules, setScopeModules] = useState(new Set()); // module có ownership_policy
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newRole, setNewRole] = useState({ key: "", name: "", description: "" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [
      { data: r, error: rErr },
      { data: p, error: pErr },
      { data: rp, error: rpErr },
      { data: ps, error: psErr },
      { data: op, error: opErr },
    ] = await Promise.all([
      supabase.from("roles").select("id, key, name, description, is_system, sort_order").is("deleted_at", null).order("sort_order"),
      supabase.from("permissions").select("id, module, action, key, description").order("module").order("action"),
      supabase.from("role_permissions").select("role_id, permission_id"),
      supabase.from("permission_scope").select("role_id, permission_id, scope"),
      supabase.from("ownership_policy").select("module"),
    ]);
    if (rErr || pErr || rpErr || psErr || opErr) {
      setError((rErr || pErr || rpErr || psErr || opErr).message);
    } else {
      setRoles(r);
      setPermissions(p);
      setGrants(new Set(rp.map((row) => `${row.role_id}:${row.permission_id}`)));
      setScopes(new Map(ps.map((row) => [`${row.role_id}:${row.permission_id}`, row.scope])));
      setScopeModules(new Set(op.map((row) => row.module)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(role, perm) {
    if (!canManage) return;
    const key = `${role.id}:${perm.id}`;
    const has = grants.has(key);
    if (has) {
      const { error: err } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", role.id)
        .eq("permission_id", perm.id);
      if (err) return alert(`Không gỡ được: ${err.message}`);
      // Gỡ permission thì scope đi kèm (nếu có) cũng không còn ý nghĩa.
      await supabase.from("permission_scope").delete().eq("role_id", role.id).eq("permission_id", perm.id);
    } else {
      const { error: err } = await supabase.from("role_permissions").insert({ role_id: role.id, permission_id: perm.id });
      if (err) return alert(`Không cấp được: ${err.message}`);
    }
    recordActivity("role_permission.change", "roles", role.id, { permission: perm.key, granted: !has });
    setGrants((s) => {
      const next = new Set(s);
      if (has) next.delete(key);
      else next.add(key);
      return next;
    });
    setScopes((s) => {
      const next = new Map(s);
      if (has) next.delete(key);
      return next;
    });
  }

  async function setScope(role, perm, scope) {
    if (!canManage) return;
    const key = `${role.id}:${perm.id}`;
    if (scope === "all") {
      // "all" = mặc định khi không có dòng permission_scope — xoá cho gọn
      // thay vì lưu thừa 1 dòng "all".
      const { error: err } = await supabase.from("permission_scope").delete().eq("role_id", role.id).eq("permission_id", perm.id);
      if (err) return alert(`Không đổi được scope: ${err.message}`);
    } else {
      const { error: err } = await supabase
        .from("permission_scope")
        .upsert({ role_id: role.id, permission_id: perm.id, scope }, { onConflict: "role_id,permission_id" });
      if (err) return alert(`Không đổi được scope: ${err.message}`);
    }
    recordActivity("permission_scope.change", "roles", role.id, { permission: perm.key, scope });
    setScopes((s) => {
      const next = new Map(s);
      if (scope === "all") next.delete(key);
      else next.set(key, scope);
      return next;
    });
  }

  async function createRole(e) {
    e.preventDefault();
    setCreating(true);
    const { error: err } = await supabase.from("roles").insert({
      key: newRole.key.trim(),
      name: newRole.name.trim(),
      description: newRole.description.trim() || null,
      is_system: false,
      sort_order: roles.length,
    });
    setCreating(false);
    if (err) return alert(`Không tạo được role: ${err.message}`);
    setNewRole({ key: "", name: "", description: "" });
    recordActivity("role.create", "roles", null, { key: newRole.key.trim() });
    load();
  }

  async function deleteRole(role) {
    if (role.is_system) return;
    if (!confirm(`Xoá role "${role.name}"? Mọi user đang gán role này cần được gán lại role khác trước.`)) return;
    const { error: err } = await supabase.from("roles").update({ deleted_at: new Date().toISOString() }).eq("id", role.id);
    if (err) return alert(`Không xoá được: ${err.message}`);
    recordActivity("role.delete", "roles", role.id);
    load();
  }

  if (loading) return <div className="page">Đang tải…</div>;

  const modules = [...new Set(permissions.map((p) => p.module))];

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="page__header">
        <h1>Roles &amp; Permissions</h1>
      </div>
      {error && <p className="field-error">{error}</p>}
      <p className="muted small">
        Tick để cấp/gỡ permission cho từng role. Với permission có Scope (module đánh dấu <em>*</em> — hiện chỉ
        "articles", xem <code>ownership_policy</code>), chọn thêm phạm vi áp dụng: Own (chỉ nội dung của chính
        mình) / Assigned (được gán làm assigned editor/reviewer/publisher) / Team / Department / All (toàn bộ,
        bỏ qua ownership). Không chọn = mặc định All. Thay đổi có hiệu lực ngay, không ảnh hưởng website công
        khai.
      </p>

      {canManage && (
        <details style={{ marginBottom: 16 }}>
          <summary>+ Role tuỳ chỉnh mới</summary>
          <form className="form" onSubmit={createRole}>
            <div className="form-grid">
              <label>
                Key (định danh, chữ thường/số/gạch dưới)
                <input
                  required
                  pattern="[a-z0-9_]{2,40}"
                  value={newRole.key}
                  onChange={(e) => setNewRole((f) => ({ ...f, key: e.target.value }))}
                />
              </label>
              <label>
                Tên hiển thị
                <input required value={newRole.name} onChange={(e) => setNewRole((f) => ({ ...f, name: e.target.value }))} />
              </label>
            </div>
            <label>
              Mô tả
              <input value={newRole.description} onChange={(e) => setNewRole((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn--solid" disabled={creating}>
                {creating ? "Đang tạo…" : "Tạo role"}
              </button>
            </div>
          </form>
        </details>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r.id} title={r.description || ""}>
                  {r.name}
                  {canManage && !r.is_system && (
                    <button className="btn btn--ghost btn--sm" style={{ marginLeft: 6 }} onClick={() => deleteRole(r)}>
                      Xoá
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <Fragment key={mod}>
                <tr>
                  <td colSpan={roles.length + 1} className="muted small" style={{ background: "var(--surface-alt, transparent)" }}>
                    <strong>
                      {mod}
                      {scopeModules.has(mod) && " *"}
                    </strong>
                  </td>
                </tr>
                {permissions
                  .filter((p) => p.module === mod)
                  .map((perm) => (
                    <tr key={perm.id}>
                      <td>
                        {perm.action}
                        <div className="muted small">{perm.description}</div>
                      </td>
                      {roles.map((r) => {
                        const key = `${r.id}:${perm.id}`;
                        const checked = grants.has(key);
                        return (
                          <td key={r.id} style={{ textAlign: "center" }}>
                            <input type="checkbox" checked={checked} disabled={!canManage} onChange={() => toggle(r, perm)} />
                            {checked && scopeModules.has(mod) && (
                              <div>
                                <select
                                  className="btn--sm"
                                  style={{ marginTop: 4, fontSize: 11 }}
                                  value={scopes.get(key) || "all"}
                                  disabled={!canManage}
                                  onChange={(e) => setScope(r, perm, e.target.value)}
                                >
                                  {SCOPE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
