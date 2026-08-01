import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Rev 17 (Layout Builder) — form cấu hình 1 Khối SINH THEO config_schema của
// layout_block_types, không hardcode field theo từng loại khối. Đây chính là
// phần "Không hardcode" của kiến trúc plugin: thêm/sửa 1 field trong
// config_schema (Danh mục Khối) là form này tự đổi theo, không cần sửa code
// React. `show_if` (tuỳ chọn trên field): chỉ hiện field khi field khác
// đang có đúng giá trị chỉ định — dùng để ẩn field không liên quan tới
// "Nguồn dữ liệu" đang chọn (vd chỉ hiện "Series" khi data_source=by_series).
export default function DynamicBlockConfigForm({ schema, value, onChange }) {
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [articleOptions, setArticleOptions] = useState([]);

  const needsSeries = schema.some((f) => f.type === "series_select");
  const needsCategory = schema.some((f) => f.type === "category_select");
  const needsArticle = schema.some((f) => f.type === "article_select" || f.type === "article_multiselect");

  useEffect(() => {
    if (!needsSeries) return;
    supabase
      .from("series")
      .select("slug, name")
      .is("deleted_at", null)
      .order("sort_order")
      .then(({ data }) => setSeriesOptions(data || []));
  }, [needsSeries]);

  useEffect(() => {
    if (!needsCategory) return;
    supabase
      .from("categories")
      .select("slug, name")
      .is("deleted_at", null)
      .order("sort_order")
      .then(({ data }) => setCategoryOptions(data || []));
  }, [needsCategory]);

  useEffect(() => {
    if (!needsArticle) return;
    supabase
      .from("articles")
      .select("slug, title")
      .is("deleted_at", null)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setArticleOptions(data || []));
  }, [needsArticle]);

  function update(key, v) {
    onChange({ ...value, [key]: v });
  }

  function shouldShow(field) {
    if (!field.show_if) return true;
    return Object.entries(field.show_if).every(([k, v]) => (value?.[k] ?? "") === v);
  }

  if (!schema || schema.length === 0) {
    return <p className="muted small">Khối này không có cấu hình riêng — chỉ điều khiển được bằng Hiển thị/Lịch chạy bên dưới.</p>;
  }

  return (
    <div className="form dynamic-block-form">
      {schema.map((field) => {
        if (!shouldShow(field)) return null;
        const current = value?.[field.key] ?? field.default ?? (field.type === "boolean" ? false : field.type === "article_multiselect" ? [] : "");

        if (field.type === "boolean") {
          return (
            <label className="checkbox-inline" key={field.key}>
              <input type="checkbox" checked={!!current} onChange={(e) => update(field.key, e.target.checked)} />
              {field.label}
            </label>
          );
        }
        if (field.type === "number") {
          return (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={current}
                onChange={(e) => update(field.key, e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
          );
        }
        if (field.type === "select") {
          return (
            <label key={field.key}>
              {field.label}
              <select value={current} onChange={(e) => update(field.key, e.target.value)}>
                {(field.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "series_select") {
          return (
            <label key={field.key}>
              {field.label}
              <select value={current} onChange={(e) => update(field.key, e.target.value)}>
                <option value="">— Chọn Series —</option>
                {seriesOptions.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "category_select") {
          return (
            <label key={field.key}>
              {field.label}
              <select value={current} onChange={(e) => update(field.key, e.target.value)}>
                <option value="">— Chọn Danh mục —</option>
                {categoryOptions.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "article_select") {
          return (
            <label key={field.key}>
              {field.label}
              <select value={current} onChange={(e) => update(field.key, e.target.value)}>
                <option value="">— Tự động —</option>
                {articleOptions.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        if (field.type === "article_multiselect") {
          const selected = Array.isArray(current) ? current : [];
          return (
            <div key={field.key}>
              <label className="field-label">{field.label}</label>
              <select
                multiple
                size={Math.min(8, Math.max(4, articleOptions.length))}
                value={selected}
                onChange={(e) => update(field.key, Array.from(e.target.selectedOptions).map((o) => o.value))}
              >
                {articleOptions.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.title}
                  </option>
                ))}
              </select>
              <p className="muted small">Giữ Ctrl/Cmd (hoặc Cmd trên Mac) để chọn nhiều bài viết.</p>
            </div>
          );
        }
        if (field.type === "textarea") {
          return (
            <label key={field.key}>
              {field.label}
              <textarea rows={8} value={current} onChange={(e) => update(field.key, e.target.value)} />
            </label>
          );
        }
        // "text" và mọi type chưa định nghĩa riêng -> input text mặc định
        return (
          <label key={field.key}>
            {field.label}
            <input value={current} onChange={(e) => update(field.key, e.target.value)} />
          </label>
        );
      })}
    </div>
  );
}
