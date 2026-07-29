import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import MediaPicker from "../components/MediaPicker";

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

const CREATIVE_KINDS = ["image", "gif", "video", "html", "native"];

const EMPTY_FORM = {
  placement_id: "",
  campaign_name: "",
  creative_kind: "image",
  media_id: null,
  html_snippet: "",
  link_url: "",
  link_target: "external",
  weight: 1,
  priority: 0,
  start_at: "",
  end_at: "",
  is_active: true,
};

export default function AdManager() {
  const [placements, setPlacements] = useState([]);
  const [placementFilter, setPlacementFilter] = useState("all");
  const [ads, setAds] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("ad_placements")
      .select("id, label")
      .order("label")
      .then(({ data }) => setPlacements(data || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("ads")
      .select(
        "id, placement_id, campaign_name, creative_kind, link_url, weight, priority, is_active, click_count, impression_count, deleted_at, media:media_id(url)"
      )
      .order("priority", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    if (placementFilter !== "all") query = query.eq("placement_id", placementFilter);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setAds([]);
    } else {
      setAds(data);
    }
    setLoading(false);
  }, [showDeleted, placementFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function editRow(id) {
    const { data, error: err } = await supabase.from("ads").select("*").eq("id", id).single();
    if (err) return alert(err.message);
    setEditingId(id);
    setForm({
      placement_id: data.placement_id,
      campaign_name: data.campaign_name,
      creative_kind: data.creative_kind,
      media_id: data.media_id,
      html_snippet: data.html_snippet || "",
      link_url: data.link_url || "",
      link_target: data.link_target,
      weight: data.weight,
      priority: data.priority,
      start_at: toLocalInput(data.start_at),
      end_at: toLocalInput(data.end_at),
      is_active: data.is_active,
    });
  }

  function startNew() {
    setEditingId("new");
    setForm({ ...EMPTY_FORM, placement_id: placements[0]?.id || "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.placement_id || !form.campaign_name.trim()) {
      setError("Vị trí và Tên chiến dịch là bắt buộc.");
      return;
    }
    setSaving(true);
    const payload = {
      placement_id: form.placement_id,
      campaign_name: form.campaign_name.trim(),
      creative_kind: form.creative_kind,
      media_id: form.media_id || null,
      html_snippet: form.creative_kind === "html" ? form.html_snippet.trim() || null : null,
      link_url: form.link_url.trim() || null,
      link_target: form.link_target,
      weight: Number(form.weight) || 1,
      priority: Number(form.priority) || 0,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      is_active: form.is_active,
    };
    const query =
      editingId === "new" ? supabase.from("ads").insert(payload) : supabase.from("ads").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleDeleted(ad) {
    const next = ad.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("ads").update({ deleted_at: next }).eq("id", ad.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Advertisement Manager</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Quảng cáo mới
          </button>
        )}
      </div>
      <p className="muted small">
        2 vị trí <code>sidebar_left</code>/<code>sidebar_right</code> tương ứng đúng 2 khối quảng cáo trái/phải đang
        chạy trên site hôm nay. Nếu chưa có quảng cáo active cho một vị trí, site tiếp tục hiển thị đúng ảnh/link đã
        cấu hình trong Site Settings — không có gì thay đổi.
      </p>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Vị trí *
              <select value={form.placement_id} onChange={(e) => setForm((f) => ({ ...f, placement_id: e.target.value }))} required>
                {placements.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tên chiến dịch *
              <input value={form.campaign_name} onChange={(e) => setForm((f) => ({ ...f, campaign_name: e.target.value }))} required />
            </label>
          </div>

          <label>
            Loại nội dung
            <select value={form.creative_kind} onChange={(e) => setForm((f) => ({ ...f, creative_kind: e.target.value }))}>
              {CREATIVE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {form.creative_kind === "html" ? (
            <label>
              HTML snippet
              <textarea rows={4} value={form.html_snippet} onChange={(e) => setForm((f) => ({ ...f, html_snippet: e.target.value }))} />
            </label>
          ) : (
            <MediaPicker label="Ảnh/Video quảng cáo" mediaId={form.media_id} onChange={(id) => setForm((f) => ({ ...f, media_id: id }))} />
          )}

          <div className="form-grid">
            <label>
              Link đích
              <input value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} />
            </label>
            <label>
              Loại link
              <select value={form.link_target} onChange={(e) => setForm((f) => ({ ...f, link_target: e.target.value }))}>
                <option value="external">external</option>
                <option value="internal">internal</option>
              </select>
            </label>
          </div>

          <div className="form-grid form-grid--3">
            <label>
              Weight
              <input type="number" min={1} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
            </label>
            <label>
              Priority
              <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
            </label>
            <label className="checkbox-inline" style={{ alignSelf: "end" }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Đang bật
            </label>
          </div>

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
        <select value={placementFilter} onChange={(e) => setPlacementFilter(e.target.value)}>
          <option value="all">Tất cả vị trí</option>
          {placements.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả quảng cáo đã xoá
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
              <th>Chiến dịch</th>
              <th>Vị trí</th>
              <th>Click</th>
              <th>Impression</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.id} className={a.deleted_at ? "is-deleted" : ""}>
                <td>{a.media?.url && <img src={a.media.url} alt="" style={{ width: 48, height: 48, objectFit: "cover" }} />}</td>
                <td>{a.campaign_name}</td>
                <td className="muted small">{a.placement_id}</td>
                <td>{a.click_count}</td>
                <td>{a.impression_count}</td>
                <td>{a.is_active ? "Đang bật" : "Đã tắt"}</td>
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
            {ads.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Chưa có quảng cáo nào khớp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
