import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import Dialog from "./ui/Dialog";
import MediaPicker from "./MediaPicker";

const MEDAL_SELECT =
  "id, name, short_description, detailed_description, alt_text, is_active, media_id, media:media_id(url)";

const EMPTY_MEDAL_FORM = {
  name: "",
  short_description: "",
  detailed_description: "",
  media_id: null,
  alt_text: "",
  is_active: true,
};

// Rev 16 — Author Medals: section nhúng thẳng trong AuthorForm (không có
// module sidebar riêng, đúng yêu cầu). "medals" (master, dùng chung) và
// "author_medals" (gán cho 1 author, KHÔNG copy dữ liệu medal — chỉ tham
// chiếu medal_id) là 2 bảng tách biệt: sửa 1 medal ở đây tự cập nhật cho
// MỌI author đang gán medal đó, vì component load lại đúng master mới nhất
// mỗi lần fetch, không lưu bản sao name/description/ảnh ở author_medals.
export default function AuthorMedals({ authorId }) {
  const { hasPermission } = useAuth();
  const canAssign = hasPermission("authors.edit");
  const canCreateMedal = hasPermission("medals.create");
  const canEditMedal = hasPermission("medals.edit");

  const [assigned, setAssigned] = useState([]);
  const [availableMedals, setAvailableMedals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addSelection, setAddSelection] = useState("");
  const [busy, setBusy] = useState(false);

  // null = đóng; {} = tạo mới; {...medal} = sửa master đang mở
  const [editingMedal, setEditingMedal] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null); // gán medal mới tạo vào author luôn

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [assignedRes, medalsRes] = await Promise.all([
      supabase
        .from("author_medals")
        .select(`id, medal_id, sort_order, is_visible, awarded_at, medal:medals(${MEDAL_SELECT})`)
        .eq("author_id", authorId)
        .order("sort_order", { ascending: true }),
      supabase.from("medals").select(MEDAL_SELECT).is("deleted_at", null).eq("is_active", true).order("name"),
    ]);
    if (assignedRes.error) setError(assignedRes.error.message);
    else setAssigned(assignedRes.data || []);
    if (!assignedRes.error && medalsRes.error) setError(medalsRes.error.message);
    else if (!medalsRes.error) setAvailableMedals(medalsRes.data || []);
    setLoading(false);
  }, [authorId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignedMedalIds = new Set(assigned.map((a) => a.medal_id));
  const addableMedals = availableMedals.filter((m) => !assignedMedalIds.has(m.id));

  async function addExisting() {
    if (!addSelection) return;
    setBusy(true);
    const nextSort = assigned.length ? Math.max(...assigned.map((a) => a.sort_order)) + 1 : 0;
    const { error: err } = await supabase
      .from("author_medals")
      .insert({ author_id: authorId, medal_id: addSelection, sort_order: nextSort });
    setBusy(false);
    if (err) return setError(err.message);
    setAddSelection("");
    load();
  }

  async function removeAssignment(row) {
    if (!confirm(`Gỡ huân chương "${row.medal?.name || ""}" khỏi author này? (Huân chương gốc không bị xoá)`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("author_medals").delete().eq("id", row.id);
    setBusy(false);
    if (err) return setError(err.message);
    load();
  }

  async function toggleVisible(row) {
    const { error: err } = await supabase
      .from("author_medals")
      .update({ is_visible: !row.is_visible })
      .eq("id", row.id);
    if (err) return setError(err.message);
    load();
  }

  async function move(row, direction) {
    const idx = assigned.findIndex((a) => a.id === row.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= assigned.length) return;
    const other = assigned[swapIdx];
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from("author_medals").update({ sort_order: other.sort_order }).eq("id", row.id),
      supabase.from("author_medals").update({ sort_order: row.sort_order }).eq("id", other.id),
    ]);
    setBusy(false);
    if (r1.error || r2.error) return setError(r1.error?.message || r2.error?.message);
    load();
  }

  async function saveMedal(form, medalId) {
    setBusy(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      short_description: form.short_description.trim() || null,
      detailed_description: form.detailed_description.trim() || null,
      media_id: form.media_id || null,
      alt_text: form.alt_text.trim() || null,
      is_active: form.is_active,
    };
    if (!payload.name) {
      setBusy(false);
      setError("Tên huân chương là bắt buộc.");
      return;
    }
    if (medalId) {
      const { error: err } = await supabase.from("medals").update(payload).eq("id", medalId);
      setBusy(false);
      if (err) return setError(err.message);
    } else {
      const { data: row, error: err } = await supabase.from("medals").insert(payload).select("id").single();
      if (err) {
        setBusy(false);
        return setError(err.message);
      }
      // Tạo mới trong ngữ cảnh 1 author -> gán luôn cho author đang sửa,
      // tránh phải mở lại "Thêm huân chương có sẵn" ngay sau khi vừa tạo.
      const nextSort = assigned.length ? Math.max(...assigned.map((a) => a.sort_order)) + 1 : 0;
      const { error: assignErr } = await supabase
        .from("author_medals")
        .insert({ author_id: authorId, medal_id: row.id, sort_order: nextSort });
      setBusy(false);
      if (assignErr) return setError(assignErr.message);
    }
    setEditingMedal(null);
    load();
  }

  return (
    <div className="author-medals">
      <label className="field-label">Huân chương</label>
      {error && <p className="field-error">{error}</p>}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <ul className="author-medals__list">
          {assigned.map((row, idx) => (
            <li key={row.id} className={`author-medals__item${row.is_visible ? "" : " is-hidden"}`}>
              {row.medal?.media?.url ? (
                <img className="author-medals__thumb" src={row.medal.media.url} alt={row.medal.alt_text || row.medal.name} />
              ) : (
                <div className="author-medals__thumb author-medals__thumb--empty" />
              )}
              <div className="author-medals__body">
                <div className="author-medals__name">
                  {row.medal?.name || "(huân chương đã bị xoá)"}
                  {!row.medal?.is_active && <span className="badge badge--deleted">Đã ẩn</span>}
                </div>
                {row.medal?.short_description && <div className="muted small">{row.medal.short_description}</div>}
              </div>
              <div className="author-medals__actions">
                <button type="button" className="btn btn--ghost btn--sm" disabled={idx === 0 || busy} onClick={() => move(row, "up")} aria-label="Lên trên">
                  ↑
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={idx === assigned.length - 1 || busy} onClick={() => move(row, "down")} aria-label="Xuống dưới">
                  ↓
                </button>
                <label className="checkbox-inline">
                  <input type="checkbox" checked={row.is_visible} onChange={() => toggleVisible(row)} disabled={busy || !canAssign} />
                  Hiện
                </label>
                {canEditMedal && row.medal && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingMedal(row.medal)}>
                    Sửa
                  </button>
                )}
                {canAssign && (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => removeAssignment(row)}>
                    Gỡ
                  </button>
                )}
              </div>
            </li>
          ))}
          {assigned.length === 0 && <li className="muted">Chưa có huân chương nào.</li>}
        </ul>
      )}

      {canAssign && (
        <div className="author-medals__add">
          <select value={addSelection} onChange={(e) => setAddSelection(e.target.value)} disabled={busy}>
            <option value="">— Chọn huân chương có sẵn —</option>
            {addableMedals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--ghost" disabled={!addSelection || busy} onClick={addExisting}>
            + Thêm
          </button>
          {canCreateMedal && (
            <button type="button" className="btn btn--ghost" onClick={() => setEditingMedal({})}>
              + Tạo huân chương mới
            </button>
          )}
        </div>
      )}

      <Dialog
        open={!!editingMedal}
        onClose={() => setEditingMedal(null)}
        title={editingMedal?.id ? "Sửa huân chương" : "Tạo huân chương mới"}
      >
        {editingMedal && (
          <MedalMasterForm
            key={editingMedal.id || "new"}
            initial={editingMedal}
            busy={busy}
            onCancel={() => setEditingMedal(null)}
            onSave={(form) => saveMedal(form, editingMedal.id)}
          />
        )}
      </Dialog>
    </div>
  );
}

function MedalMasterForm({ initial, busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: initial.name || "",
    short_description: initial.short_description || "",
    detailed_description: initial.detailed_description || "",
    media_id: initial.media_id || null,
    alt_text: initial.alt_text || "",
    is_active: initial.is_active ?? true,
  });

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      {initial.id && (
        <p className="muted small">
          Sửa huân chương này áp dụng ngay cho mọi author đang được gán — không tạo bản sao.
        </p>
      )}
      <label>
        Tên *
        <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
      </label>
      <label>
        Mô tả ngắn
        <input value={form.short_description} onChange={(e) => update("short_description", e.target.value)} />
      </label>
      <label>
        Mô tả chi tiết
        <textarea rows={3} value={form.detailed_description} onChange={(e) => update("detailed_description", e.target.value)} />
      </label>
      <MediaPicker
        label="Ảnh (PNG/WebP/GIF — GIF giữ hoạt ảnh khi hiển thị công khai)"
        mediaId={form.media_id}
        onChange={(id) => update("media_id", id)}
        allowedTypes={["image", "gif"]}
      />
      <label>
        Alt text
        <input value={form.alt_text} onChange={(e) => update("alt_text", e.target.value)} />
      </label>
      <label className="checkbox-inline">
        <input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} />
        Đang hoạt động (hiển thị công khai)
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Huỷ
        </button>
        <button type="submit" className="btn btn--solid" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </form>
  );
}
