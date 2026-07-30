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
  hero_gif_media_id: null,
  hero_gif_song_title: "",
  hero_gif_song_artist: "",
  spotify_embed_url: "",
  social_facebook: "",
  social_instagram: "",
  social_youtube: "",
  social_tiktok: "",
  ad_left_vertical_media_id: null,
  ad_left_horizontal_media_id: null,
  ad_left_link: "",
  ad_right_vertical_media_id: null,
  ad_right_horizontal_media_id: null,
  ad_right_link: "",
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
          hero_gif_media_id: data.hero_gif_media_id,
          hero_gif_song_title: data.hero_gif_song_title || "",
          hero_gif_song_artist: data.hero_gif_song_artist || "",
          spotify_embed_url: data.spotify_embed_url || "",
          social_facebook: data.social_facebook || "",
          social_instagram: data.social_instagram || "",
          social_youtube: data.social_youtube || "",
          social_tiktok: data.social_tiktok || "",
          ad_left_vertical_media_id: data.ad_left_vertical_media_id,
          ad_left_horizontal_media_id: data.ad_left_horizontal_media_id,
          ad_left_link: data.ad_left_link || "",
          ad_right_vertical_media_id: data.ad_right_vertical_media_id,
          ad_right_horizontal_media_id: data.ad_right_horizontal_media_id,
          ad_right_link: data.ad_right_link || "",
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
      hero_gif_media_id: form.hero_gif_media_id || null,
      hero_gif_song_title: form.hero_gif_song_title.trim() || null,
      hero_gif_song_artist: form.hero_gif_song_artist.trim() || null,
      spotify_embed_url: form.spotify_embed_url.trim() || null,
      social_facebook: form.social_facebook.trim() || null,
      social_instagram: form.social_instagram.trim() || null,
      social_youtube: form.social_youtube.trim() || null,
      social_tiktok: form.social_tiktok.trim() || null,
      ad_left_vertical_media_id: form.ad_left_vertical_media_id || null,
      ad_left_horizontal_media_id: form.ad_left_horizontal_media_id || null,
      ad_left_link: form.ad_left_link.trim() || null,
      ad_right_vertical_media_id: form.ad_right_vertical_media_id || null,
      ad_right_horizontal_media_id: form.ad_right_horizontal_media_id || null,
      ad_right_link: form.ad_right_link.trim() || null,
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
            placeholder="Ví dụ: Disallow: /private/ — nối thêm vào robots.txt, mỗi dòng 1 chỉ thị"
          />
        </label>

        <details>
          <summary>Mạng xã hội & Spotify</summary>
          <p className="muted small">Để trống sẽ ẩn icon/nút tương ứng ở đầu/chân trang, đúng hành vi hiện tại.</p>
          <label>
            Link Facebook
            <input value={form.social_facebook} onChange={(e) => update("social_facebook", e.target.value)} />
          </label>
          <label>
            Link Instagram
            <input value={form.social_instagram} onChange={(e) => update("social_instagram", e.target.value)} />
          </label>
          <label>
            Link YouTube
            <input value={form.social_youtube} onChange={(e) => update("social_youtube", e.target.value)} />
          </label>
          <label>
            Link TikTok
            <input value={form.social_tiktok} onChange={(e) => update("social_tiktok", e.target.value)} />
          </label>
          <label>
            Link nhúng Spotify
            <input
              value={form.spotify_embed_url}
              onChange={(e) => update("spotify_embed_url", e.target.value)}
              placeholder="https://open.spotify.com/embed/track/xxxxx"
            />
          </label>
        </details>

        <details>
          <summary>Dự phòng Hero &amp; Quảng cáo (khi Hero Manager/Advertisement Manager chưa có mục nào đang bật)</summary>
          <p className="muted small">
            Chỉ hiển thị khi <strong>Hero Manager</strong> không có slot đang bật, hoặc{" "}
            <strong>Advertisement Manager</strong> không có quảng cáo đang bật cho đúng vị trí — nếu đã có, các mục dưới
            đây không có tác dụng.
          </p>
          <MediaPicker
            label="Hero GIF dự phòng"
            mediaId={form.hero_gif_media_id}
            onChange={(id) => update("hero_gif_media_id", id)}
          />
          <div className="form-grid">
            <label>
              Tên bài hát
              <input value={form.hero_gif_song_title} onChange={(e) => update("hero_gif_song_title", e.target.value)} />
            </label>
            <label>
              Nghệ sĩ
              <input value={form.hero_gif_song_artist} onChange={(e) => update("hero_gif_song_artist", e.target.value)} />
            </label>
          </div>
          <MediaPicker
            label="Quảng cáo trái — Ảnh/Clip dọc"
            mediaId={form.ad_left_vertical_media_id}
            onChange={(id) => update("ad_left_vertical_media_id", id)}
          />
          <MediaPicker
            label="Quảng cáo trái — Ảnh/Clip ngang"
            mediaId={form.ad_left_horizontal_media_id}
            onChange={(id) => update("ad_left_horizontal_media_id", id)}
          />
          <label>
            Quảng cáo trái — Link
            <input value={form.ad_left_link} onChange={(e) => update("ad_left_link", e.target.value)} />
          </label>
          <MediaPicker
            label="Quảng cáo phải — Ảnh/Clip dọc"
            mediaId={form.ad_right_vertical_media_id}
            onChange={(id) => update("ad_right_vertical_media_id", id)}
          />
          <MediaPicker
            label="Quảng cáo phải — Ảnh/Clip ngang"
            mediaId={form.ad_right_horizontal_media_id}
            onChange={(id) => update("ad_right_horizontal_media_id", id)}
          />
          <label>
            Quảng cáo phải — Link
            <input value={form.ad_right_link} onChange={(e) => update("ad_right_link", e.target.value)} />
          </label>
        </details>

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
