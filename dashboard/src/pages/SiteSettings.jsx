import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import MediaPicker from "../components/MediaPicker";

const EMPTY_FORM = {
  site_name: "",
  site_description: "",
  robots_directives: "",
  cloudflare_analytics_token: "",
  logo_media_id: null,
  header_bg_media_id: null,
  favicon_media_id: null,
  default_og_image_id: null,
  maintenance_mode: false,
  maintenance_message: "",
};

export default function SiteSettings() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase.from("site_settings").select("*").eq("id", true).maybeSingle();
      if (err) {
        setError(err.message);
      } else if (data) {
        setForm({
          site_name: data.site_name || "",
          site_description: data.site_description || "",
          robots_directives: data.robots_directives || "",
          cloudflare_analytics_token: data.cloudflare_analytics_token || "",
          logo_media_id: data.logo_media_id,
          header_bg_media_id: data.header_bg_media_id,
          favicon_media_id: data.favicon_media_id,
          default_og_image_id: data.default_og_image_id,
          maintenance_mode: data.maintenance_mode || false,
          maintenance_message: data.maintenance_message || "",
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      site_name: form.site_name.trim() || null,
      site_description: form.site_description.trim() || null,
      robots_directives: form.robots_directives.trim() || null,
      cloudflare_analytics_token: form.cloudflare_analytics_token.trim() || null,
      logo_media_id: form.logo_media_id || null,
      header_bg_media_id: form.header_bg_media_id || null,
      favicon_media_id: form.favicon_media_id || null,
      default_og_image_id: form.default_og_image_id || null,
      maintenance_mode: form.maintenance_mode,
      maintenance_message: form.maintenance_message.trim() || null,
    };
    // site_settings là bảng singleton (đúng 1 dòng, đã seed sẵn qua
    // migrate_rev7_site_config.sql) — dùng update() thay vì upsert(), vì
    // upsert() luôn thực thi dưới dạng INSERT ... ON CONFLICT DO UPDATE, và
    // Postgres RLS kiểm tra policy INSERT trên câu lệnh đó bất kể cuối cùng
    // có update hay không. Bảng này cố tình không có policy INSERT cho
    // editor (không có lý do hợp lệ để tạo thêm dòng thứ 2), nên upsert()
    // luôn bị RLS chặn với lỗi "new row violates row-level security policy".
    const { error: err } = await supabase.from("site_settings").update(payload).eq("id", true);
    setSaving(false);
    if (err) return setError(err.message);
    setSaved(true);
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <div className="page__header">
        <h1>Site Settings</h1>
      </div>
      <p className="muted small">
        Các trường này thay thế dần <code>content/settings/site.yml</code> — nếu để trống, website tự dùng giá trị mặc
        định hiện tại, không có gì thay đổi trên site công khai cho tới khi bạn điền và Lưu ở đây.
      </p>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Tên website (site_name)
          <input
            value={form.site_name}
            onChange={(e) => update("site_name", e.target.value)}
            placeholder="The New Culture"
          />
        </label>

        <label>
          Mô tả mặc định (site_description)
          <textarea
            rows={3}
            value={form.site_description}
            onChange={(e) => update("site_description", e.target.value)}
            placeholder="Dùng làm meta description mặc định cho các trang chưa tự có mô tả riêng."
          />
        </label>

        <MediaPicker label="Logo" mediaId={form.logo_media_id} onChange={(id) => update("logo_media_id", id)} />
        <MediaPicker
          label="Ảnh nền khung header"
          mediaId={form.header_bg_media_id}
          onChange={(id) => update("header_bg_media_id", id)}
        />
        <MediaPicker label="Favicon" mediaId={form.favicon_media_id} onChange={(id) => update("favicon_media_id", id)} />
        <MediaPicker
          label="Ảnh Open Graph mặc định"
          mediaId={form.default_og_image_id}
          onChange={(id) => update("default_og_image_id", id)}
        />

        <label>
          Cloudflare Analytics Token
          <input
            value={form.cloudflare_analytics_token}
            onChange={(e) => update("cloudflare_analytics_token", e.target.value)}
            placeholder="Lấy tại dashboard Cloudflare → Analytics → Web Analytics"
          />
        </label>

        <label>
          Robots directives (tuỳ chọn)
          <input
            value={form.robots_directives}
            onChange={(e) => update("robots_directives", e.target.value)}
            placeholder="Chưa được build.py sử dụng ở giai đoạn này — lưu trước để dùng ở Phase SEO Manager"
          />
        </label>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={form.maintenance_mode}
            onChange={(e) => update("maintenance_mode", e.target.checked)}
          />
          Bật chế độ bảo trì (chưa được build.py sử dụng ở giai đoạn này)
        </label>
        <label>
          Thông báo bảo trì
          <input
            value={form.maintenance_message}
            onChange={(e) => update("maintenance_message", e.target.value)}
          />
        </label>

        {error && <p className="field-error">{error}</p>}
        {saved && <p className="muted small">Đã lưu.</p>}

        <div className="form-actions">
          <button type="submit" className="btn btn--solid" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
