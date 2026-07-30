import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import MediaPicker from "../components/MediaPicker";

const KINDS = [
  "album_release",
  "event",
  "workshop",
  "community",
  "newsletter",
  "membership",
  "announcement",
  "promotion",
  "campaign",
];

// Bug fix (production audit): trước đây placement là <input> text tự do —
// scripts/build.py (pick_active_campaign) chỉ so khớp CHÍNH XÁC 1 chuỗi
// literal "sticky_bottom", nên gõ sai 1 ký tự khiến promotion lưu thành
// công nhưng không bao giờ hiện trên site, không cảnh báo gì. Khớp đúng
// CHECK constraint mới thêm ở migrate_rev10_production_audit_fixes.sql.
const PLACEMENTS = ["sticky_bottom"];

const EMPTY_FORM = {
  slug: "",
  kind: "campaign",
  title: "",
  placement: "sticky_bottom",
  media_id: null,
  mobile_media_id: null,
  video_url: "",
  destination_url: "",
  open_in_new_tab: true,
  dismissible: true,
  dismiss_days: 0,
  priority: 0,
  start_at: "",
  end_at: "",
  is_active: false,
};

export default function PromotionManager() {
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
      .from("promotions")
      .select("id, slug, kind, title, placement, priority, is_active, start_at, end_at, deleted_at")
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
    const { data, error: err } = await supabase.from("promotions").select("*").eq("id", id).single();
    if (err) return alert(err.message);
    setEditingId(id);
    setForm({
      slug: data.slug,
      kind: data.kind,
      title: data.title,
      placement: data.placement,
      media_id: data.media_id,
      mobile_media_id: data.mobile_media_id,
      video_url: data.video_url || "",
      destination_url: data.destination_url || "",
      open_in_new_tab: data.open_in_new_tab,
      dismissible: data.dismissible,
      dismiss_days: data.dismiss_days,
      priority: data.priority,
      start_at: data.start_at || "",
      end_at: data.end_at || "",
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
    if (!form.slug.trim() || !form.title.trim()) {
      setError("Slug và Tiêu đề là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      kind: form.kind,
      title: form.title.trim(),
      placement: form.placement.trim() || "sticky_bottom",
      media_id: form.media_id || null,
      mobile_media_id: form.mobile_media_id || null,
      video_url: form.video_url.trim() || null,
      destination_url: form.destination_url.trim() || null,
      open_in_new_tab: form.open_in_new_tab,
      dismissible: form.dismissible,
      dismiss_days: Number(form.dismiss_days) || 0,
      priority: Number(form.priority) || 0,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      is_active: form.is_active,
    };
    const query =
      editingId === "new"
        ? supabase.from("promotions").insert(payload)
        : supabase.from("promotions").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "Slug này đã tồn tại." : err.message);
      return;
    }
    cancelEdit();
    load();
  }

  async function toggleDeleted(item) {
    const next = item.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("promotions").update({ deleted_at: next }).eq("id", item.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Promotion Manager</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Chiến dịch mới
          </button>
        )}
      </div>
      <p className="muted small">
        Thay thế dần <code>content/campaigns/*.md</code>. Đúng 1 chiến dịch active + trong khoảng ngày + priority cao
        nhất được hiển thị cho mỗi vị trí (placement) — logic chọn giữ nguyên như hệ thống cũ. Nếu chưa có chiến dịch
        nào ở đây, site tiếp tục đọc đúng chiến dịch hiện có trong <code>content/campaigns/</code>.
      </p>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Slug *
              <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
            </label>
            <label>
              Tiêu đề *
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </label>
          </div>

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
              Vị trí (placement)
              <select value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
                {PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <MediaPicker label="Ảnh — Desktop" mediaId={form.media_id} onChange={(id) => setForm((f) => ({ ...f, media_id: id }))} />
          <MediaPicker label="Ảnh — Mobile (tuỳ chọn)" mediaId={form.mobile_media_id} onChange={(id) => setForm((f) => ({ ...f, mobile_media_id: id }))} />
          <label>
            Video URL (nếu là banner video, ưu tiên hơn ảnh)
            <input value={form.video_url} onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))} />
          </label>

          <div className="form-grid">
            <label>
              Link đích
              <input value={form.destination_url} onChange={(e) => setForm((f) => ({ ...f, destination_url: e.target.value }))} />
            </label>
            <label className="checkbox-inline" style={{ alignSelf: "end" }}>
              <input type="checkbox" checked={form.open_in_new_tab} onChange={(e) => setForm((f) => ({ ...f, open_in_new_tab: e.target.checked }))} />
              Mở tab mới
            </label>
          </div>

          <div className="form-grid form-grid--3">
            <label className="checkbox-inline">
              <input type="checkbox" checked={form.dismissible} onChange={(e) => setForm((f) => ({ ...f, dismissible: e.target.checked }))} />
              Cho phép đóng
            </label>
            <label>
              Số ngày ẩn sau khi đóng
              <input type="number" min={0} value={form.dismiss_days} onChange={(e) => setForm((f) => ({ ...f, dismiss_days: e.target.value }))} />
            </label>
            <label>
              Priority
              <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Ngày bắt đầu
              <input type="date" value={form.start_at} onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))} />
            </label>
            <label>
              Ngày kết thúc
              <input type="date" value={form.end_at} onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))} />
            </label>
          </div>

          <label className="checkbox-inline">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Đang hoạt động
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
          Hiện cả chiến dịch đã xoá
        </label>
      </div>

      {error && editingId === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tiêu đề</th>
              <th>Loại</th>
              <th>Vị trí</th>
              <th>Priority</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className={p.deleted_at ? "is-deleted" : ""}>
                <td>{p.title}</td>
                <td className="muted small">{p.kind}</td>
                <td className="muted small">{p.placement}</td>
                <td>{p.priority}</td>
                <td>{p.is_active ? "Đang hoạt động" : "Tắt"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => editRow(p.id)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(p)}>
                    {p.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Chưa có chiến dịch nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
