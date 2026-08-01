import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";

// "Bố cục Trang" (Rev 17) — danh sách mọi page_layouts. Trang chủ luôn có
// lối tắt riêng ("Bố cục Trang chủ", xem navConfig.js) vì build.py hiện CHỈ
// đọc bố cục cho page_key="homepage" — tạo Bố cục cho page_key khác vẫn lưu
// được (đúng kiến trúc chung "1 page_layout cho 1 trang"), nhưng CHƯA có nơi
// build.py áp dụng, để dành Phase sau (xem báo cáo Rev 17).
export default function PageLayoutsList() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("layout.create");
  const canEdit = hasPermission("layout.edit") || hasPermission("layout.delete");

  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newPageKey, setNewPageKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("page_layouts")
      .select("id, page_key, name, is_active, deleted_at")
      .is("deleted_at", null)
      .order("page_key");
    if (err) {
      setError(err.message);
      setLayouts([]);
    } else {
      setLayouts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createLayout(e) {
    e.preventDefault();
    setError("");
    const pageKey = newPageKey.trim().toLowerCase().replace(/\s+/g, "-");
    if (!pageKey) {
      setError("Mã trang (page_key) là bắt buộc.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.from("page_layouts").insert({ page_key: pageKey, name: pageKey });
    setBusy(false);
    if (err) return setError(err.message);
    setNewPageKey("");
    load();
  }

  async function toggleActive(layout) {
    const { error: err } = await supabase.from("page_layouts").update({ is_active: !layout.is_active }).eq("id", layout.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  async function toggleDeleted(layout) {
    const { error: err } = await supabase
      .from("page_layouts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", layout.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Bố cục Trang</h1>
      </div>
      <p className="muted small">
        Ngoài "Bố cục Trang chủ" (đã áp dụng lên website), bạn có thể tạo trước Bố cục cho các trang khác — hiện chưa
        có trang nào ngoài trang chủ đọc theo Bố cục này.
      </p>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Mã trang</th>
              <th>Tên</th>
              <th>Đang bật</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {layouts.map((l) => (
              <tr key={l.id}>
                <td>{l.page_key}</td>
                <td>{canEdit ? <Link to={`/layout/pages/${l.page_key}`}>{l.name}</Link> : l.name}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleActive(l)} disabled={!canEdit}>
                    {l.is_active ? "Đang bật" : "Đã tắt"}
                  </button>
                </td>
                <td className="table-actions">
                  {hasPermission("layout.delete") && (
                    <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(l)}>
                      Xoá
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {layouts.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có Bố cục Trang nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {canCreate && (
        <form className="form" onSubmit={createLayout} style={{ marginTop: 24, maxWidth: 420 }}>
          <label>
            Tạo Bố cục Trang mới (mã trang, vd "archive")
            <input value={newPageKey} onChange={(e) => setNewPageKey(e.target.value)} placeholder="page-key" />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn--solid" disabled={busy}>
              {busy ? "Đang tạo…" : "Tạo"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
