import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

const EMPTY_FORM = {
  url: "",
  type: "image",
  alt_text: "",
  caption: "",
  credit: "",
  width: "",
  height: "",
  size_bytes: "",
  uploaded_by: "",
  article_id: "",
  folder_id: "",
};

const UPLOADABLE_TYPES = ["image", "gif"]; // khớp allowed_mime_types của bucket "media" (Rev 5)
const REPLACEABLE_TYPES = ["image", "gif"];

// Trích path lưu trữ từ 1 public URL do Supabase Storage sinh ra, dạng
// ".../storage/v1/object/public/media/<path>" — dùng để "Thay ảnh" upload
// đè đúng path cũ (upsert), giữ nguyên url hiện có, để mọi nơi khác đang
// lưu sẵn chuỗi url này (vd articles.cover_image_url) tự động hiện ảnh mới
// mà không cần sửa lại từng bản ghi.
function extractStoragePath(url) {
  const marker = "/object/public/media/";
  const idx = (url || "").indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export default function MediaForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const replaceInputRef = useRef(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [authors, setAuthors] = useState([]);
  const [articles, setArticles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [originalTagIds, setOriginalTagIds] = useState(new Set());
  const [usage, setUsage] = useState({ articlesCover: [], articlesPoster: [], authorsAvatar: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const [replaceError, setReplaceError] = useState("");

  useEffect(() => {
    // Bug fix (production audit): chặn setState nếu :id đã đổi trước khi
    // request này về (React Router không remount, chỉ re-run effect).
    let cancelled = false;

    async function loadLookups() {
      const [{ data: a }, { data: art }, { data: fol }, { data: tg }] = await Promise.all([
        supabase.from("authors").select("id, name").is("deleted_at", null).order("name"),
        supabase.from("articles").select("id, slug").is("deleted_at", null).order("slug"),
        supabase.from("media_folders").select("id, name").is("deleted_at", null).order("name"),
        supabase.from("tags").select("id, name").is("deleted_at", null).order("name"),
      ]);
      if (cancelled) return;
      setAuthors(a || []);
      setArticles(art || []);
      setFolders(fol || []);
      setTags(tg || []);
    }
    async function loadMedia() {
      if (isNew) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from("media")
        .select("*, media_tags(tag_id)")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message || "Không tìm thấy media.");
        setLoading(false);
        return;
      }
      setForm({
        url: data.url,
        type: data.type,
        alt_text: data.alt_text || "",
        caption: data.caption || "",
        credit: data.credit || "",
        width: data.width ?? "",
        height: data.height ?? "",
        size_bytes: data.size_bytes ?? "",
        uploaded_by: data.uploaded_by || "",
        article_id: data.article_id || "",
        folder_id: data.folder_id || "",
      });
      const tagIds = new Set((data.media_tags || []).map((r) => r.tag_id));
      setSelectedTagIds(tagIds);
      setOriginalTagIds(tagIds);

      // "Đang được dùng ở đâu": tra ngược theo đúng url, vì các bảng khác
      // lưu thẳng chuỗi URL (không có khoá ngoại tới media.id).
      const [cover, poster, avatar] = await Promise.all([
        supabase.from("articles").select("id, slug, title").eq("cover_image_url", data.url).is("deleted_at", null),
        supabase.from("articles").select("id, slug, title").eq("poster_image_url", data.url).is("deleted_at", null),
        supabase.from("authors").select("id, slug, name").eq("avatar_url", data.url).is("deleted_at", null),
      ]);
      if (cancelled) return;
      setUsage({
        articlesCover: cover.data || [],
        articlesPoster: poster.data || [],
        authorsAvatar: avatar.data || [],
      });
      setLoading(false);
    }
    loadLookups();
    loadMedia();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleTag(tagId) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.url.trim()) {
      setError("URL là bắt buộc.");
      return;
    }

    setSaving(true);
    const payload = {
      url: form.url.trim(),
      type: form.type,
      alt_text: form.alt_text.trim() || null,
      caption: form.caption.trim() || null,
      credit: form.credit.trim() || null,
      width: form.width === "" ? null : Number(form.width),
      height: form.height === "" ? null : Number(form.height),
      size_bytes: form.size_bytes === "" ? null : Number(form.size_bytes),
      uploaded_by: form.uploaded_by || null,
      article_id: form.article_id || null,
      folder_id: form.folder_id || null,
    };
    let mediaId = id;
    if (isNew) {
      const { data, error: err } = await supabase.from("media").insert(payload).select("id").single();
      if (err) {
        setSaving(false);
        setError(err.code === "23505" ? "URL này đã tồn tại trong thư viện media." : err.message);
        return;
      }
      mediaId = data.id;
    } else {
      const { error: err } = await supabase.from("media").update(payload).eq("id", id);
      if (err) {
        setSaving(false);
        setError(err.code === "23505" ? "URL này đã tồn tại trong thư viện media." : err.message);
        return;
      }
    }

    // Đồng bộ media_tags: chỉ INSERT tag mới thêm / DELETE tag vừa bỏ chọn
    // — cùng đúng khuôn article_tags trong ArticleForm.jsx.
    const toAdd = [...selectedTagIds].filter((t) => !originalTagIds.has(t));
    const toRemove = [...originalTagIds].filter((t) => !selectedTagIds.has(t));
    if (toAdd.length) {
      await supabase.from("media_tags").insert(toAdd.map((tag_id) => ({ media_id: mediaId, tag_id })));
    }
    if (toRemove.length) {
      await supabase.from("media_tags").delete().eq("media_id", mediaId).in("tag_id", toRemove);
    }

    setSaving(false);
    navigate("/media");
  }

  async function handleReplaceFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReplaceError("");

    const path = extractStoragePath(form.url);
    if (!path) {
      setReplaceError("Ảnh này không nằm trong Supabase Storage (bucket media) — không thể thay trực tiếp. Hãy dán URL mới thủ công.");
      return;
    }
    setReplacing(true);
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true, contentType: file.type });
    setReplacing(false);
    if (uploadError) {
      setReplaceError(`Thay ảnh thất bại: ${uploadError.message}`);
      return;
    }
    // url không đổi (cùng path) — mọi bài viết/tác giả đang tham chiếu
    // đúng chuỗi url này tự động hiển thị ảnh mới, không cần sửa gì thêm.
    alert("Đã thay ảnh thành công. URL giữ nguyên, mọi nơi đang dùng ảnh này sẽ tự cập nhật.");
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <h1>{isNew ? "Media mới" : "Sửa media"}</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Loại
          <select value={form.type} onChange={(e) => update("type", e.target.value)}>
            <option value="image">image</option>
            <option value="gif">gif</option>
            <option value="video">video</option>
            <option value="audio">audio</option>
            <option value="document">document</option>
          </select>
        </label>

        {UPLOADABLE_TYPES.includes(form.type) ? (
          <ImageUploader
            label="Ảnh (upload lên Supabase Storage)"
            value={form.url}
            onChange={(v) => update("url", v)}
            pathPrefix="media"
          />
        ) : (
          <label>
            URL *
            <input
              value={form.url}
              onChange={(e) => update("url", e.target.value)}
              placeholder="Loại video/audio/document chưa hỗ trợ upload trực tiếp — dán URL đã lưu trữ sẵn"
              required
            />
          </label>
        )}

        {!isNew && REPLACEABLE_TYPES.includes(form.type) && (
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => replaceInputRef.current?.click()}
              disabled={replacing}
            >
              {replacing ? "Đang thay ảnh…" : "Thay ảnh (giữ nguyên URL)"}
            </button>
            <input ref={replaceInputRef} type="file" accept="image/*" hidden onChange={handleReplaceFile} />
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Upload ảnh mới đè lên đúng vị trí lưu trữ hiện tại — URL không đổi, mọi bài viết/tác giả đang dùng ảnh
              này tự động hiện ảnh mới.
            </p>
            {replaceError && <p className="field-error">{replaceError}</p>}
          </div>
        )}

        <label>
          Caption
          <input
            value={form.caption}
            onChange={(e) => update("caption", e.target.value)}
            placeholder="Mô tả ngắn hiển thị trong thư viện media"
          />
        </label>

        <label>
          Credit (ghi công / photographer)
          <input value={form.credit} onChange={(e) => update("credit", e.target.value)} />
        </label>

        <label>
          Alt text
          <input value={form.alt_text} onChange={(e) => update("alt_text", e.target.value)} />
        </label>

        <label>
          Thư mục
          <select value={form.folder_id} onChange={(e) => update("folder_id", e.target.value)}>
            <option value="">— Không có thư mục —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <label className="field-label">Thẻ</label>
          <div className="tag-chips">
            {tags.map((t) => (
              <button
                type="button"
                key={t.id}
                className={selectedTagIds.has(t.id) ? "tag-chip is-selected" : "tag-chip"}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid form-grid--3">
          <label>
            Chiều rộng (px)
            <input type="number" min={1} value={form.width} onChange={(e) => update("width", e.target.value)} />
          </label>
          <label>
            Chiều cao (px)
            <input type="number" min={1} value={form.height} onChange={(e) => update("height", e.target.value)} />
          </label>
          <label>
            Dung lượng (bytes)
            <input
              type="number"
              min={0}
              value={form.size_bytes}
              onChange={(e) => update("size_bytes", e.target.value)}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Người upload
            <select value={form.uploaded_by} onChange={(e) => update("uploaded_by", e.target.value)}>
              <option value="">— Không rõ —</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gắn với bài viết
            <select value={form.article_id} onChange={(e) => update("article_id", e.target.value)}>
              <option value="">— Không gắn —</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.slug}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!isNew && (
          <div>
            <label className="field-label">Đang được dùng ở</label>
            {usage.articlesCover.length === 0 && usage.articlesPoster.length === 0 && usage.authorsAvatar.length === 0 ? (
              <p className="muted small">Chưa nơi nào tham chiếu trực tiếp URL này.</p>
            ) : (
              <ul className="muted small">
                {usage.articlesCover.map((a) => (
                  <li key={`cover-${a.id}`}>Ảnh bìa bài viết — {a.title}</li>
                ))}
                {usage.articlesPoster.map((a) => (
                  <li key={`poster-${a.id}`}>Ảnh poster bài viết — {a.title}</li>
                ))}
                {usage.authorsAvatar.map((a) => (
                  <li key={`avatar-${a.id}`}>Ảnh đại diện tác giả — {a.name}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate("/media")}>
            Huỷ
          </button>
          <button type="submit" className="btn btn--solid" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
