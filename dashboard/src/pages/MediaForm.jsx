import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

const EMPTY_FORM = {
  url: "",
  type: "image",
  alt_text: "",
  width: "",
  height: "",
  size_bytes: "",
  uploaded_by: "",
  article_id: "",
};

const UPLOADABLE_TYPES = ["image", "gif"]; // khớp allowed_mime_types của bucket "media" (Rev 5)

export default function MediaForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [authors, setAuthors] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadLookups() {
      const [{ data: a }, { data: art }] = await Promise.all([
        supabase.from("authors").select("id, name").is("deleted_at", null).order("name"),
        supabase.from("articles").select("id, slug").is("deleted_at", null).order("slug"),
      ]);
      setAuthors(a || []);
      setArticles(art || []);
    }
    async function loadMedia() {
      if (isNew) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase.from("media").select("*").eq("id", id).maybeSingle();
      if (err || !data) {
        setError(err?.message || "Không tìm thấy media.");
      } else {
        setForm({
          url: data.url,
          type: data.type,
          alt_text: data.alt_text || "",
          width: data.width ?? "",
          height: data.height ?? "",
          size_bytes: data.size_bytes ?? "",
          uploaded_by: data.uploaded_by || "",
          article_id: data.article_id || "",
        });
      }
      setLoading(false);
    }
    loadLookups();
    loadMedia();
  }, [id, isNew]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
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
      width: form.width === "" ? null : Number(form.width),
      height: form.height === "" ? null : Number(form.height),
      size_bytes: form.size_bytes === "" ? null : Number(form.size_bytes),
      uploaded_by: form.uploaded_by || null,
      article_id: form.article_id || null,
    };
    const query = isNew
      ? supabase.from("media").insert(payload)
      : supabase.from("media").update(payload).eq("id", id);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "URL này đã tồn tại trong thư viện media." : err.message);
      return;
    }
    navigate("/media");
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

        <label>
          Alt text
          <input value={form.alt_text} onChange={(e) => update("alt_text", e.target.value)} />
        </label>

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
