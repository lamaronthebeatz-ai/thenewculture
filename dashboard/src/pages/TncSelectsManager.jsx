import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

// Migration TNC Selects: Sveltia -> Dashboard (không phải module mới).
//
// Dữ liệu KHÔNG đổi chỗ — "ranking" đã là cột jsonb trên chính bảng
// `articles` từ Rev 4 (trước cả CMS V2), build.py đã đọc thẳng từ Supabase
// (load_articles(): "ranking": row.get("ranking") or []) từ lâu, không phải
// đọc content/articles/*.md nữa. Trang này KHÔNG thêm bảng/cột mới — chỉ
// thay giao diện quản trị: trước đây Sveltia dùng widget "list" (song/
// artist/cover/youtube/note, xem git history admin/config.yml trước Phase 0)
// rồi sau khi Articles collection bị vô hiệu hoá ở Sveltia, cách duy nhất
// còn lại là gõ tay JSON thô trong ArticleForm.jsx (mục "Nâng cao: Ranking").
// Trang này thay thế đúng ô JSON thô đó bằng UI có cấu trúc thật + kéo-thả
// đổi thứ hạng, khớp đúng shape build.py đang đọc: {rank, song, artist,
// cover, youtube, note} — không thêm field, không đổi field.
const EMPTY_ITEM = { song: "", artist: "", cover: "", youtube: "", note: "" };

// Chấp nhận dán nguyên link YouTube hoặc chỉ ID — build.py/render_ranking()
// chỉ cần đúng phần ID (dùng để nhúng iframe/thumbnail), giữ đúng hành vi
// hiện có (cột "youtube" trong DB luôn là ID trần, không phải URL đầy đủ).
function extractYoutubeId(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  const match = v.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{6,})/);
  return match ? match[1] : v;
}

export default function TncSelectsManager() {
  const [articles, setArticles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const [editingIndex, setEditingIndex] = useState(null); // null | "new" | số
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const dragIndexRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await supabase
        .from("articles")
        .select("id, slug, title, status, ranking")
        .is("deleted_at", null)
        .order("sort_order")
        .order("slug");
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setArticles(data || []);
      // Mặc định chọn đúng bài mà build.py sẽ hiển thị trên trang chủ —
      // latest_ranking_article(): bài published, ranking không rỗng, đầu
      // tiên theo thứ tự sort_order/slug (đã ORDER BY sẵn ở query trên).
      const withRanking = (data || []).filter((a) => Array.isArray(a.ranking) && a.ranking.length > 0);
      const current = withRanking.find((a) => a.status === "published") || withRanking[0];
      if (current) setSelectedId(current.id);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const a = articles.find((x) => x.id === selectedId);
    if (!a) {
      setItems([]);
      return;
    }
    setItems((a.ranking || []).map((it) => ({ ...it })));
    setEditingIndex(null);
    setSaved(false);
  }, [selectedId, articles]);

  const selectedArticle = articles.find((a) => a.id === selectedId) || null;

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items.map((it, i) => ({ item: it, index: i }));
    return items
      .map((it, i) => ({ item: it, index: i }))
      .filter(({ item }) => `${item.song} ${item.artist || ""}`.toLowerCase().includes(q));
  }, [items, search]);

  function startAddItem() {
    setEditingIndex("new");
    setItemForm(EMPTY_ITEM);
  }
  function startEditItem(idx) {
    setEditingIndex(idx);
    setItemForm({ ...items[idx] });
  }
  function cancelItemEdit() {
    setEditingIndex(null);
    setItemForm(EMPTY_ITEM);
  }
  function submitItemForm(e) {
    e.preventDefault();
    if (!itemForm.song.trim()) return;
    const clean = {
      song: itemForm.song.trim(),
      artist: itemForm.artist.trim(),
      cover: itemForm.cover || "",
      youtube: extractYoutubeId(itemForm.youtube),
      note: itemForm.note.trim(),
    };
    if (editingIndex === "new") {
      setItems((prev) => [...prev, clean]);
    } else {
      setItems((prev) => prev.map((it, i) => (i === editingIndex ? clean : it)));
    }
    cancelItemEdit();
    setSaved(false);
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setSaved(false);
  }

  function handleDragStart(idx) {
    dragIndexRef.current = idx;
  }
  function handleDrop(idx) {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    if (from === null || from === idx) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    // rank luôn tính lại theo đúng vị trí sau kéo-thả — khớp cách
    // render_ranking_spotlight()/render_ranking() dùng it['rank'] trực tiếp.
    const payload = items.map((it, i) => ({
      rank: i + 1,
      song: it.song,
      artist: it.artist || "",
      cover: it.cover || "",
      youtube: it.youtube || "",
      note: it.note || "",
    }));
    const { error: err } = await supabase.from("articles").update({ ranking: payload }).eq("id", selectedId);
    setSaving(false);
    if (err) return setError(err.message);
    setItems(payload);
    setArticles((prev) => prev.map((a) => (a.id === selectedId ? { ...a, ranking: payload } : a)));
    setSaved(true);
  }

  async function toggleStatus() {
    if (!selectedArticle) return;
    const next = selectedArticle.status === "published" ? "draft" : "published";
    setError("");
    const { error: err } = await supabase.from("articles").update({ status: next }).eq("id", selectedId);
    if (err) return setError(err.message);
    setArticles((prev) => prev.map((a) => (a.id === selectedId ? { ...a, status: next } : a)));
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <div className="page__header">
        <h1>TNC Selects</h1>
      </div>
      <p className="muted small">
        Quản lý bảng xếp hạng (Ranking) của bài viết — thay cho ô "Ranking (JSON)" cũ trong Articles. Trang chủ luôn hiện
        đúng bài <strong>đã đăng</strong>, có ranking, theo đúng thứ tự sắp xếp bài viết hiện có (không đổi logic).
      </p>

      <div className="form-grid">
        <label>
          Bài viết
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Chọn bài viết —</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} {a.ranking?.length ? `(${a.ranking.length} mục)` : ""} — {a.status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedArticle && <p className="muted">Chọn 1 bài viết để quản lý ranking.</p>}

      {selectedArticle && (
        <>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <span>
              Trạng thái bài viết: <strong>{selectedArticle.status}</strong>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={toggleStatus}>
              {selectedArticle.status === "published" ? "Chuyển về Nháp" : "Đăng bài"}
            </button>
            <input
              type="search"
              aria-label="Tìm theo tên ca khúc hoặc nghệ sĩ"
              placeholder="Tìm theo ca khúc/nghệ sĩ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 220 }}
            />
            {editingIndex === null && (
              <button type="button" className="btn btn--solid btn--sm" onClick={startAddItem}>
                + Mục mới
              </button>
            )}
          </div>

          {editingIndex !== null && (
            <form className="form" onSubmit={submitItemForm} style={{ marginTop: 16, marginBottom: 20 }}>
              <div className="form-grid">
                <label>
                  Tên ca khúc *
                  <input
                    value={itemForm.song}
                    onChange={(e) => setItemForm((f) => ({ ...f, song: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Nghệ sĩ
                  <input value={itemForm.artist} onChange={(e) => setItemForm((f) => ({ ...f, artist: e.target.value }))} />
                </label>
              </div>
              <ImageUploader
                label="Ảnh bìa (để trống sẽ tự lấy ảnh từ video YouTube)"
                value={itemForm.cover}
                onChange={(url) => setItemForm((f) => ({ ...f, cover: url }))}
                pathPrefix="articles/ranking-cover"
              />
              <label>
                Link YouTube
                <input
                  value={itemForm.youtube}
                  onChange={(e) => setItemForm((f) => ({ ...f, youtube: e.target.value }))}
                  placeholder="Dán link hoặc ID video YouTube"
                />
              </label>
              <label>
                Bình luận
                <textarea
                  rows={3}
                  value={itemForm.note}
                  onChange={(e) => setItemForm((f) => ({ ...f, note: e.target.value }))}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn btn--ghost" onClick={cancelItemEdit}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn--solid">
                  {editingIndex === "new" ? "Thêm vào danh sách" : "Cập nhật mục"}
                </button>
              </div>
            </form>
          )}

          <p className="muted small" style={{ marginTop: 16 }}>
            Kéo-thả để đổi thứ hạng (#1 trên cùng). Tìm kiếm chỉ để xem nhanh — vẫn kéo-thả trên danh sách đầy đủ.
          </p>
          <ul className="tnc-selects__list">
            {visibleItems.map(({ item, index }) => (
              <li
                key={index}
                className="tnc-selects__row"
                draggable={!search}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
              >
                <span className="tnc-selects__handle" title="Kéo để đổi thứ hạng">⠿</span>
                <span className="tnc-selects__rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="tnc-selects__thumb">
                  {item.cover ? (
                    <img src={item.cover} alt="" />
                  ) : item.youtube ? (
                    <img src={`https://img.youtube.com/vi/${item.youtube}/hqdefault.jpg`} alt="" />
                  ) : null}
                </span>
                <span className="tnc-selects__body">
                  <strong>{item.song}</strong>
                  {item.artist && <span className="muted small"> — {item.artist}</span>}
                </span>
                <span className="tnc-selects__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditItem(index)}>
                    Sửa
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeItem(index)}>
                    Xoá
                  </button>
                </span>
              </li>
            ))}
            {visibleItems.length === 0 && <li className="muted">Chưa có mục ranking nào.</li>}
          </ul>

          {error && <p className="field-error">{error}</p>}
          {saved && <p className="muted small">Đã lưu.</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--solid" onClick={handleSave} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu Ranking"}
            </button>
          </div>

          <h2 style={{ fontSize: "1.1rem", marginTop: 32 }}>Xem trước — Ranking Spotlight (trang chủ, top 5)</h2>
          <div className="tnc-selects__preview">
            {items.slice(0, 5).map((item, i) => (
              <div key={i} className="tnc-selects__preview-row">
                <span className="tnc-selects__preview-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="tnc-selects__thumb">
                  {item.cover ? (
                    <img src={item.cover} alt="" />
                  ) : item.youtube ? (
                    <img src={`https://img.youtube.com/vi/${item.youtube}/hqdefault.jpg`} alt="" />
                  ) : null}
                </span>
                <span className="tnc-selects__body">
                  <strong>{item.song}</strong>
                  {item.artist && <span className="muted small"> — {item.artist}</span>}
                </span>
              </div>
            ))}
            {items.length === 0 && <p className="muted">Chưa có gì để xem trước.</p>}
            {items.length > 5 && <p className="muted small">+{items.length - 5} mục khác trong bài viết đầy đủ.</p>}
          </div>
        </>
      )}
    </div>
  );
}
