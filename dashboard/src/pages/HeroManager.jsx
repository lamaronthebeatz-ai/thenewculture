import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import MediaPicker from "../components/MediaPicker";

// datetime-local <-> timestamptz ISO helpers (cùng khuôn ArticleForm.jsx)
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

const KINDS = ["image", "gif", "video", "article_carousel"];
const ANIMATIONS = ["none", "fade", "ken-burns", "slide"];

const EMPTY_FORM = {
  kind: "gif",
  title: "",
  subtitle: "",
  desktop_media_id: null,
  mobile_media_id: null,
  overlay_color: "",
  overlay_opacity: "",
  gradient_css: "",
  cta_label: "",
  cta_url: "",
  animation: "none",
  priority: 0,
  start_at: "",
  end_at: "",
  is_active: true,
};

export default function HeroManager() {
  const [slots, setSlots] = useState([]);
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
      .from("hero_slots")
      .select("id, kind, title, subtitle, priority, is_active, start_at, end_at, deleted_at, desktop:desktop_media_id(url)")
      .order("priority", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setSlots([]);
    } else {
      setSlots(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(slot, full) {
    setEditingId(slot.id);
    setForm({
      kind: full.kind,
      title: full.title || "",
      subtitle: full.subtitle || "",
      desktop_media_id: full.desktop_media_id,
      mobile_media_id: full.mobile_media_id,
      overlay_color: full.overlay_color || "",
      overlay_opacity: full.overlay_opacity ?? "",
      gradient_css: full.gradient_css || "",
      cta_label: full.cta_label || "",
      cta_url: full.cta_url || "",
      animation: full.animation || "none",
      priority: full.priority,
      start_at: toLocalInput(full.start_at),
      end_at: toLocalInput(full.end_at),
      is_active: full.is_active,
    });
  }

  async function editRow(id) {
    const { data, error: err } = await supabase.from("hero_slots").select("*").eq("id", id).single();
    if (err) return alert(err.message);
    startEdit({ id }, data);
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
    if (!form.desktop_media_id) {
      setError("Cần chọn ảnh/video (Desktop) cho hero slot.");
      return;
    }
    setSaving(true);
    const payload = {
      kind: form.kind,
      title: form.title.trim() || null,
      subtitle: form.subtitle.trim() || null,
      desktop_media_id: form.desktop_media_id,
      mobile_media_id: form.mobile_media_id || null,
      overlay_color: form.overlay_color.trim() || null,
      overlay_opacity: form.overlay_opacity === "" ? null : Number(form.overlay_opacity),
      gradient_css: form.gradient_css.trim() || null,
      cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null,
      animation: form.animation,
      priority: Number(form.priority) || 0,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      is_active: form.is_active,
    };
    const query =
      editingId === "new"
        ? supabase.from("hero_slots").insert(payload)
        : supabase.from("hero_slots").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleDeleted(slot) {
    const next = slot.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("hero_slots").update({ deleted_at: next }).eq("id", slot.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Hero Manager</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Hero slot mới
          </button>
        )}
      </div>
      <p className="muted small">
        Thay thế dần khung GIF hero đọc từ <code>content/settings/site.yml</code>. Nếu chưa có slot nào đang bật, trang
        chủ tiếp tục hiển thị đúng khung GIF hiện tại — không có gì thay đổi. Hero bài viết nổi bật (Featured/Hero
        Priority ở module Articles) không thuộc trang này, vẫn quản lý như cũ.
      </p>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Loại
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thứ tự ưu tiên
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </label>
          </div>

          <MediaPicker
            label="Ảnh/Video — Desktop *"
            mediaId={form.desktop_media_id}
            onChange={(id) => setForm((f) => ({ ...f, desktop_media_id: id }))}
          />
          <MediaPicker
            label="Ảnh/Video — Mobile (tuỳ chọn)"
            mediaId={form.mobile_media_id}
            onChange={(id) => setForm((f) => ({ ...f, mobile_media_id: id }))}
          />

          <div className="form-grid">
            <label>
              Tên bài hát / Tiêu đề
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label>
              Nghệ sĩ / Phụ đề
              <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            </label>
          </div>

          <details>
            <summary>Nâng cao: Overlay / Gradient / CTA / Animation (chưa hiển thị trên site ở giai đoạn này)</summary>
            <div className="form-grid">
              <label>
                Overlay color
                <input value={form.overlay_color} onChange={(e) => setForm((f) => ({ ...f, overlay_color: e.target.value }))} />
              </label>
              <label>
                Overlay opacity (0–1)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={form.overlay_opacity}
                  onChange={(e) => setForm((f) => ({ ...f, overlay_opacity: e.target.value }))}
                />
              </label>
              <label>
                Animation
                <select value={form.animation} onChange={(e) => setForm((f) => ({ ...f, animation: e.target.value }))}>
                  {ANIMATIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Gradient CSS
              <input value={form.gradient_css} onChange={(e) => setForm((f) => ({ ...f, gradient_css: e.target.value }))} />
            </label>
            <div className="form-grid">
              <label>
                CTA — nhãn nút
                <input value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} />
              </label>
              <label>
                CTA — link
                <input value={form.cta_url} onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))} />
              </label>
            </div>
          </details>

          <div className="form-grid">
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
          Hiện cả slot đã xoá
        </label>
      </div>

      {error && editingId === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Xem trước</th>
              <th>Tiêu đề</th>
              <th>Loại</th>
              <th>Ưu tiên</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id} className={s.deleted_at ? "is-deleted" : ""}>
                <td>{s.desktop?.url && <img src={s.desktop.url} alt="" style={{ width: 60, height: 34, objectFit: "cover" }} />}</td>
                <td>{s.title || "—"}</td>
                <td>{s.kind}</td>
                <td>{s.priority}</td>
                <td>{s.is_active ? "Đang bật" : "Đã tắt"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => editRow(s.id)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(s)}>
                    {s.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {slots.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Chưa có hero slot nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
