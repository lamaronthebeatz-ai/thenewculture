import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

const EMPTY_FORM = {
  slug: "",
  code: "",
  name: "",
  description: "",
  cover_image_url: "",
  accent_color: "",
  sort_order: 0,
};

export default function SeriesForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    supabase
      .from("series")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.message || "Không tìm thấy series.");
        } else {
          setForm({
            slug: data.slug,
            code: data.code || "",
            name: data.name,
            description: data.description || "",
            cover_image_url: data.cover_image_url || "",
            accent_color: data.accent_color || "",
            sort_order: data.sort_order,
          });
        }
        setLoading(false);
      });
  }, [id, isNew]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.slug.trim() || !form.name.trim()) {
      setError("Slug và Tên là bắt buộc.");
      return;
    }

    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      code: form.code.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      cover_image_url: form.cover_image_url.trim() || null,
      accent_color: form.accent_color.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    const query = isNew
      ? supabase.from("series").insert(payload)
      : supabase.from("series").update(payload).eq("id", id);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "Slug này đã tồn tại." : err.message);
      return;
    }
    navigate("/series");
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <h1>{isNew ? "Series mới" : "Sửa series"}</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Slug *
            <input value={form.slug} onChange={(e) => update("slug", e.target.value)} required />
          </label>
          <label>
            Tên *
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </label>
        </div>

        <label>
          Mô tả
          <textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
        </label>

        <ImageUploader
          label="Ảnh bìa series"
          value={form.cover_image_url}
          onChange={(v) => update("cover_image_url", v)}
          pathPrefix="series/cover"
        />

        <div className="form-grid form-grid--3">
          <label>
            Mã lưu trữ (vd TNC·01)
            <input value={form.code} onChange={(e) => update("code", e.target.value)} />
          </label>
          <label>
            Màu nhấn (accent_color)
            <input
              value={form.accent_color}
              onChange={(e) => update("accent_color", e.target.value)}
              placeholder="vd red, gold"
            />
          </label>
          <label>
            Thứ tự hiển thị
            <input type="number" value={form.sort_order} onChange={(e) => update("sort_order", e.target.value)} />
          </label>
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate("/series")}>
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
