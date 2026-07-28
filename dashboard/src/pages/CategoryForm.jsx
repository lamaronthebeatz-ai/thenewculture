import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const EMPTY_FORM = { slug: "", name: "", description: "", parent_id: "", sort_order: 0 };

export default function CategoryForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [candidateParents, setCandidateParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: parents } = await supabase
        .from("categories")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      setCandidateParents((parents || []).filter((p) => p.id !== id));

      if (!isNew) {
        const { data, error: err } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
        if (err || !data) {
          setError(err?.message || "Không tìm thấy category.");
        } else {
          setForm({
            slug: data.slug,
            name: data.name,
            description: data.description || "",
            parent_id: data.parent_id || "",
            sort_order: data.sort_order,
          });
        }
      }
      setLoading(false);
    }
    load();
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
      name: form.name.trim(),
      description: form.description.trim() || null,
      parent_id: form.parent_id || null,
      sort_order: Number(form.sort_order) || 0,
    };
    const query = isNew
      ? supabase.from("categories").insert(payload)
      : supabase.from("categories").update(payload).eq("id", id);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      setError(err.code === "23505" ? "Slug này đã tồn tại." : err.message);
      return;
    }
    navigate("/categories");
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <h1>{isNew ? "Category mới" : "Sửa category"}</h1>
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

        <div className="form-grid">
          <label>
            Danh mục cha
            <select value={form.parent_id} onChange={(e) => update("parent_id", e.target.value)}>
              <option value="">— Không có (danh mục gốc) —</option>
              {candidateParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thứ tự hiển thị
            <input type="number" value={form.sort_order} onChange={(e) => update("sort_order", e.target.value)} />
          </label>
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate("/categories")}>
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
