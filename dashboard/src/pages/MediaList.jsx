import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const EMPTY_FOLDER_FORM = { name: "", slug: "" };

export default function MediaList() {
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const [showFolderManager, setShowFolderManager] = useState(false);
  const [folderForm, setFolderForm] = useState(EMPTY_FOLDER_FORM);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [folderError, setFolderError] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  const loadFolders = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("media_folders")
      .select("id, name, slug, deleted_at")
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    // Bug fix (production audit): trước đây không bắt error — lỗi query âm
    // thầm khiến dropdown lọc theo thư mục chỉ còn "Tất cả thư mục" mà
    // không có cảnh báo nào cho biên tập viên.
    if (err) setError(err.message);
    else setFolders(data || []);
  }, []);

  const loadTags = useCallback(async () => {
    const { data, error: err } = await supabase.from("tags").select("id, name").is("deleted_at", null).order("name");
    if (err) setError(err.message);
    else setTags(data || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("media")
      .select(
        "id, url, type, alt_text, caption, credit, deleted_at, folder_id, authors(name), articles(slug), media_tags(tag_id), folder:folder_id(name)"
      )
      .order("created_at", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    if (typeFilter !== "all") query = query.eq("type", typeFilter);
    if (folderFilter !== "all") query = query.eq("folder_id", folderFilter);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setItems([]);
    } else {
      setItems(data);
    }
    setLoading(false);
  }, [typeFilter, folderFilter, showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadFolders();
    loadTags();
  }, [loadFolders, loadTags]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (tagFilter !== "all" && !(m.media_tags || []).some((mt) => mt.tag_id === tagFilter)) return false;
      if (!q) return true;
      const haystack = [m.url, m.caption, m.alt_text, m.credit].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, tagFilter, search]);

  async function toggleDeleted(row) {
    const next = row.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("media").update({ deleted_at: next }).eq("id", row.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  function startEditFolder(folder) {
    setEditingFolderId(folder.id);
    setFolderForm({ name: folder.name, slug: folder.slug });
    setFolderError("");
  }

  function startNewFolder() {
    setEditingFolderId("new");
    setFolderForm(EMPTY_FOLDER_FORM);
    setFolderError("");
  }

  function cancelFolderEdit() {
    setEditingFolderId(null);
    setFolderForm(EMPTY_FOLDER_FORM);
    setFolderError("");
  }

  async function handleFolderSubmit(e) {
    e.preventDefault();
    setFolderError("");
    if (!folderForm.name.trim() || !folderForm.slug.trim()) {
      setFolderError("Tên và Slug thư mục là bắt buộc.");
      return;
    }
    const payload = { name: folderForm.name.trim(), slug: folderForm.slug.trim() };
    setSavingFolder(true);
    const query =
      editingFolderId === "new"
        ? supabase.from("media_folders").insert(payload)
        : supabase.from("media_folders").update(payload).eq("id", editingFolderId);
    const { error: err } = await query;
    setSavingFolder(false);
    if (err) {
      setFolderError(err.code === "23505" ? "Slug thư mục này đã tồn tại." : err.message);
      return;
    }
    cancelFolderEdit();
    loadFolders();
  }

  async function toggleFolderDeleted(folder) {
    const { error: err } = await supabase
      .from("media_folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", folder.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    loadFolders();
    load();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Media</h1>
        <Link className="btn btn--solid" to="/media/new">
          + Media mới
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          aria-label="Tìm theo caption, alt text, credit, URL"
          placeholder="Tìm theo caption, alt text, credit, URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
          <option value="all">Tất cả thư mục</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">Tất cả thẻ</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Tất cả loại</option>
          <option value="image">image</option>
          <option value="gif">gif</option>
          <option value="video">video</option>
          <option value="audio">audio</option>
          <option value="document">document</option>
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả media đã xoá
        </label>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowFolderManager((v) => !v)}>
          {showFolderManager ? "Đóng quản lý thư mục" : "Quản lý thư mục"}
        </button>
      </div>

      {showFolderManager && (
        <div className="form" style={{ marginBottom: 20 }}>
          <div className="page__header">
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Thư mục</h2>
            {editingFolderId === null && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={startNewFolder}>
                + Thư mục mới
              </button>
            )}
          </div>

          {editingFolderId !== null && (
            <form className="form-grid" onSubmit={handleFolderSubmit} style={{ marginTop: 10 }}>
              <label>
                Tên *
                <input
                  value={folderForm.name}
                  onChange={(e) => setFolderForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Slug *
                <input
                  value={folderForm.slug}
                  onChange={(e) => setFolderForm((f) => ({ ...f, slug: e.target.value }))}
                  required
                />
              </label>
              <div className="form-actions">
                <button type="button" className="btn btn--ghost" onClick={cancelFolderEdit}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn--solid" disabled={savingFolder}>
                  {savingFolder ? "Đang lưu…" : "Lưu"}
                </button>
              </div>
            </form>
          )}
          {folderError && <p className="field-error">{folderError}</p>}

          <ul style={{ marginTop: 10 }}>
            {folders.map((f) => (
              <li key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0" }}>
                <span>{f.name}</span>
                <span className="muted small">{f.slug}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditFolder(f)}>
                  Sửa
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleFolderDeleted(f)}>
                  Xoá
                </button>
              </li>
            ))}
            {folders.length === 0 && <li className="muted">Chưa có thư mục nào.</li>}
          </ul>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Xem trước</th>
              <th>Caption / URL</th>
              <th>Thư mục</th>
              <th>Loại</th>
              <th>Gắn với bài viết</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((m) => (
              <tr key={m.id} className={m.deleted_at ? "is-deleted" : ""}>
                <td>
                  {(m.type === "image" || m.type === "gif") && (
                    <img src={m.url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                  )}
                </td>
                <td>
                  <Link to={`/media/${m.id}`}>{m.caption || m.alt_text || "(chưa có caption)"}</Link>
                  <div className="muted small">{m.url}</div>
                </td>
                <td>{m.folder?.name || "—"}</td>
                <td>{m.type}</td>
                <td>{m.articles?.slug || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(m)}>
                    {m.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {visibleItems.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Không có media nào khớp bộ lọc hiện tại.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
