import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp" },
  { value: "review", label: "Chờ duyệt" },
  { value: "scheduled", label: "Đã lên lịch" },
  { value: "published", label: "Đã đăng" },
  { value: "archived", label: "Lưu trữ" },
];

const EMPTY_FORM = {
  slug: "",
  title: "",
  dek: "",
  body: "",
  cover_image_url: "",
  cover_credit: "",
  poster_image_url: "",
  author_id: "",
  series_id: "",
  category_id: "",
  status: "draft",
  featured: false,
  hero_priority: false,
  read_time_minutes: 0,
  sort_order: 999,
  published_at: "",
  ranking: "[]",
};

// datetime-local <-> timestamptz ISO helpers
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

export default function ArticleForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [authors, setAuthors] = useState([]);
  const [series, setSeries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [originalTagIds, setOriginalTagIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Bug fix (production audit): React Router không remount component khi
    // chỉ đổi :id trên cùng route — nếu request của id CŨ trả về SAU request
    // của id MỚI (thứ tự mạng không đảm bảo), setState ở đây sẽ ghi đè dữ
    // liệu bài viết đang hiển thị đúng bằng dữ liệu bài KHÁC. Cờ `cancelled`
    // chặn mọi setState từ 1 lượt effect đã bị thay bởi lượt sau (đúng mẫu
    // đã dùng ở DashboardHome.jsx).
    let cancelled = false;

    async function loadLookups() {
      const [{ data: a }, { data: s }, { data: c }, { data: t }] = await Promise.all([
        supabase.from("authors").select("id, name").is("deleted_at", null).order("name"),
        supabase.from("series").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("categories").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("tags").select("id, name").is("deleted_at", null).order("name"),
      ]);
      if (cancelled) return;
      setAuthors(a || []);
      setSeries(s || []);
      setCategories(c || []);
      setTags(t || []);
    }

    async function loadArticle() {
      if (isNew) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from("articles")
        .select("*, article_tags(tag_id)")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError(err?.message || "Không tìm thấy bài viết.");
        setLoading(false);
        return;
      }
      setForm({
        slug: data.slug,
        title: data.title,
        dek: data.dek || "",
        body: data.body || "",
        cover_image_url: data.cover_image_url || "",
        cover_credit: data.cover_credit || "",
        poster_image_url: data.poster_image_url || "",
        author_id: data.author_id || "",
        series_id: data.series_id || "",
        category_id: data.category_id || "",
        status: data.status,
        featured: data.featured,
        hero_priority: data.hero_priority,
        read_time_minutes: data.read_time_minutes,
        sort_order: data.sort_order,
        published_at: toLocalInput(data.published_at),
        ranking: JSON.stringify(data.ranking ?? [], null, 2),
      });
      const tagIds = new Set((data.article_tags || []).map((r) => r.tag_id));
      setSelectedTagIds(tagIds);
      setOriginalTagIds(tagIds);
      setLoading(false);
    }

    loadLookups();
    loadArticle();
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

    if (!form.slug.trim() || !form.title.trim()) {
      setError("Slug và Tiêu đề là bắt buộc.");
      return;
    }
    if (!form.author_id) {
      setError("Vui lòng chọn tác giả.");
      return;
    }
    if (form.status === "published" && !form.published_at) {
      setError("Bài viết ở trạng thái 'Đã đăng' bắt buộc phải có ngày đăng (published_at).");
      return;
    }
    let rankingParsed;
    try {
      rankingParsed = JSON.parse(form.ranking || "[]");
      if (!Array.isArray(rankingParsed)) throw new Error("phải là mảng");
    } catch (err) {
      setError(`Trường Ranking (JSON) không hợp lệ: ${err.message}`);
      return;
    }

    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      dek: form.dek.trim() || null,
      body: form.body,
      cover_image_url: form.cover_image_url.trim() || null,
      cover_credit: form.cover_credit.trim() || null,
      poster_image_url: form.poster_image_url.trim() || null,
      author_id: form.author_id,
      series_id: form.series_id || null,
      category_id: form.category_id || null,
      status: form.status,
      featured: form.featured,
      hero_priority: form.hero_priority,
      read_time_minutes: Number(form.read_time_minutes) || 0,
      sort_order: Number(form.sort_order) || 999,
      published_at: fromLocalInput(form.published_at),
      ranking: rankingParsed,
    };

    let articleId = id;
    if (isNew) {
      const { data, error: err } = await supabase.from("articles").insert(payload).select("id").single();
      if (err) {
        setSaving(false);
        setError(friendlyError(err));
        return;
      }
      articleId = data.id;
    } else {
      const { error: err } = await supabase.from("articles").update(payload).eq("id", id);
      if (err) {
        setSaving(false);
        setError(friendlyError(err));
        return;
      }
    }

    // Đồng bộ article_tags: chỉ INSERT tag mới thêm / DELETE tag vừa bỏ chọn
    const toAdd = [...selectedTagIds].filter((t) => !originalTagIds.has(t));
    const toRemove = [...originalTagIds].filter((t) => !selectedTagIds.has(t));
    if (toAdd.length) {
      await supabase.from("article_tags").insert(toAdd.map((tag_id) => ({ article_id: articleId, tag_id })));
    }
    if (toRemove.length) {
      await supabase
        .from("article_tags")
        .delete()
        .eq("article_id", articleId)
        .in("tag_id", toRemove);
    }

    setSaving(false);
    navigate("/articles");
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <h1>{isNew ? "Bài viết mới" : "Sửa bài viết"}</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Slug *
            <input value={form.slug} onChange={(e) => update("slug", e.target.value)} required />
          </label>
          <label>
            Tiêu đề *
            <input value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </label>
        </div>

        <label>
          Tóm tắt (dek)
          <textarea rows={2} value={form.dek} onChange={(e) => update("dek", e.target.value)} />
        </label>

        <label>
          Nội dung (Markdown)
          <textarea rows={14} value={form.body} onChange={(e) => update("body", e.target.value)} />
        </label>

        <div className="form-grid">
          <ImageUploader
            label="Ảnh bìa (cover)"
            value={form.cover_image_url}
            onChange={(v) => update("cover_image_url", v)}
            pathPrefix="articles/cover"
          />
          <label>
            Ghi nguồn ảnh bìa
            <input value={form.cover_credit} onChange={(e) => update("cover_credit", e.target.value)} />
          </label>
        </div>

        <ImageUploader
          label="Ảnh poster (tuỳ chọn)"
          value={form.poster_image_url}
          onChange={(v) => update("poster_image_url", v)}
          pathPrefix="articles/poster"
        />

        <div className="form-grid form-grid--3">
          <label>
            Tác giả *
            <select value={form.author_id} onChange={(e) => update("author_id", e.target.value)} required>
              <option value="">— Chọn —</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Series
            <select value={form.series_id} onChange={(e) => update("series_id", e.target.value)}>
              <option value="">— Không có —</option>
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={form.category_id} onChange={(e) => update("category_id", e.target.value)}>
              <option value="">— Không có —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid form-grid--3">
          <label>
            Trạng thái
            <select value={form.status} onChange={(e) => update("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ngày đăng (published_at)
            <input
              type="datetime-local"
              value={form.published_at}
              onChange={(e) => update("published_at", e.target.value)}
            />
          </label>
          <label>
            Thứ tự hiển thị (sort_order)
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => update("sort_order", e.target.value)}
            />
          </label>
        </div>

        <div className="form-grid form-grid--3">
          <label>
            Thời gian đọc (phút, 0 = tự ước tính)
            <input
              type="number"
              min={0}
              value={form.read_time_minutes}
              onChange={(e) => update("read_time_minutes", e.target.value)}
            />
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => update("featured", e.target.checked)}
            />
            Nổi bật (featured)
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={form.hero_priority}
              onChange={(e) => update("hero_priority", e.target.checked)}
            />
            Ưu tiên Hero
          </label>
        </div>

        <div>
          <label className="field-label">Tags</label>
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

        <details>
          <summary>Nâng cao: Ranking (JSON) — chỉ dùng cho bài có bảng xếp hạng</summary>
          <textarea
            rows={8}
            value={form.ranking}
            onChange={(e) => update("ranking", e.target.value)}
          />
        </details>

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate("/articles")}>
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

function friendlyError(err) {
  if (err.code === "23505") return "Slug này đã tồn tại — vui lòng chọn slug khác.";
  return err.message;
}
