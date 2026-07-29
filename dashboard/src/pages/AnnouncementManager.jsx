import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local) {
  if (!local) return null;
  return new Date(local).toISOString();
}

const KINDS = ["bar_top", "bar_bottom", "scrolling_text", "breaking_news", "ticker", "countdown"];
const STYLES = ["info", "warning", "critical", "brand"];

const EMPTY_FORM = {
  kind: "bar_top",
  message: "",
  link_url: "",
  countdown_at: "",
  style: "info",
  priority: 0,
  start_at: "",
  end_at: "",
  is_active: false,
};

export default function AnnouncementManager() {
  const [items, setItems] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("announcements")
      .select("id, kind, message, link_url, style, priority, is_active, start_at, end_at, deleted_at")
      .order("priority", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setItems([]);
    } else {
      setItems(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  async function editRow(id) {
    const { data, error: err } = await supabase.from("announcements").select("*").eq("id", id).single();
    if (err) return alert(err.message);
    setEditingId(id);
    setForm({
      kind: data.kind,
      message: data.message,
      link_url: data.link_url || "",
      countdown_at: toLocalInput(data.countdown_at),
      style: data.style,
      priority: data.priority,
      start_at: toLocalInput(data.start_at),
      end_at: toLocalInput(data.end_at),
      is_active: data.is_active,
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.message.trim()) {
      setError("Nội dung thông báo là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      kind: form.kind,
      message: form.message.trim(),
      link_url: form.link_url.trim() || null,
      countdown_at: form.kind === "countdown" ? fromLocalInput(form.countdown_at) : null,
      style: form.style,
      priority: Number(form.priority) || 0,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      is_active: form.is_active,
    };
    const query =
      editingId === "new"
        ? supabase.from("announcements").insert(payload)
        : supabase.from("announcements").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleActive(item) {
    const { error: err } = await supabase.from("announcements").update({ is_active: !item.is_active }).eq("id", item.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  async function toggleDeleted(item) {
    const next = item.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("announcements").update({ deleted_at: next }).eq("id", item.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Announcement Manager</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Thông báo mới
          </button>
        )}
      </div>
      <p className="muted small">
        Hiển thị 1 thanh thông báo duy nhất phía trên đầu trang (ưu tiên cao nhất, đang bật, trong khoảng thời gian
        hiệu lực). Chưa có thông báo nào đang bật thì không hiển thị gì — website giữ nguyên như hiện tại.
      </p>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <label>
            Nội dung *
            <input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required />
          </label>

          <div className="form-grid">
            <label>
              Loại (kind)
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Màu (style)
              <select value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Link (tuỳ chọn)
            <input value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} />
          </label>

          {form.kind === "countdown" && (
            <label>
              Thời điểm đếm ngược
              <input
                type="datetime-local"
                value={form.countdown_at}
                onChange={(e) => setForm((f) => ({ ...f, countdown_at: e.target.value }))}
              />
            </label>
          )}

          <div className="form-grid form-grid--3">
            <label>
              Priority
              <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
            </label>
            <label>
              Bắt đầu
              <input type="datetime-local" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} />
            </label>
            <label>
              Kết thúc
              <input type="datetime-local" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} />
            </label>
          </div>

          <label className="checkbox-inline">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Đang bật
          </label>

          {error && <p className="field-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
              Huỷ
            </button>
            <button type="submit" className="btn btn--solid" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả thông báo đã xoá
        </label>
      </div>

      {error && editingId === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nội dung</th>
              <th>Loại</th>
              <th>Màu</th>
              <th>Priority</th>
              <th>Hoạt động</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className={a.deleted_at ? "is-deleted" : ""}>
                <td>{a.message}</td>
                <td className="muted small">{a.kind}</td>
                <td className="muted small">{a.style}</td>
                <td>{a.priority}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleActive(a)}>
                    {a.is_active ? "Đang bật" : "Đã tắt"}
                  </button>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => editRow(a.id)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(a)}>
                    {a.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Chưa có thông báo nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
