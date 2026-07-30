-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 12: Dashboard Coverage Completion —
-- Site Settings (Batch A).
--
-- Audit (xác nhận trực tiếp trong code, không suy đoán): content/settings/
-- site.yml (Sveltia collection "settings", file "site") có các field sau mà
-- site_settings (Rev 7) CHƯA có, nên Dashboard hoàn toàn không điều khiển
-- được — chỉ sửa được qua Sveltia:
--   - spotify_embed_url: render_spotify_block() đọc thẳng SETTINGS (YAML),
--     KHÔNG có field/module Dashboard nào tương đương.
--   - social_facebook/instagram/youtube/tiktok: active_socials() (icon chân
--     trang) + follow_button_url() (nút "Theo dõi" đầu trang) đọc thẳng
--     SETTINGS (YAML). HeroManager/AdManager/MenuBuilder không thay thế
--     được các field này (khác cấu trúc dữ liệu).
--   - hero_gif/hero_gif_song_title/hero_gif_song_artist: là lớp FALLBACK của
--     render_gif_hero() khi bảng hero_slots (Rev 8) không có slot active —
--     HeroManager chỉ quản lý hero_slots, không quản lý được lớp fallback
--     này, nên khi hero_slots rỗng, site vẫn phụ thuộc Sveltia.
--   - ad_left_vertical/horizontal/link, ad_right_vertical/horizontal/link:
--     tương tự — lớp fallback của render_ad_block() khi bảng ads (Rev 8)
--     không có ad active cho placement đó, AdManager không quản lý được.
--
-- Migration này CHỈ mở rộng bảng site_settings đã có (Rev 7) bằng ALTER
-- TABLE — không tạo bảng mới, không sửa migrate_rev7_site_config.sql.
-- Ảnh/video dùng đúng quy ước *_media_id (uuid -> media.id) đã áp dụng cho
-- logo_media_id/header_bg_media_id/favicon_media_id ở Rev 7 (media hỗ trợ cả
-- ảnh và video, xem migrate_rev6_media_library.sql).
-- ============================================================================

alter table public.site_settings
  add column if not exists hero_gif_media_id            uuid references public.media (id) on delete set null,
  add column if not exists hero_gif_song_title           text,
  add column if not exists hero_gif_song_artist          text,
  add column if not exists spotify_embed_url             text,
  add column if not exists social_facebook                text,
  add column if not exists social_instagram               text,
  add column if not exists social_youtube                 text,
  add column if not exists social_tiktok                  text,
  add column if not exists ad_left_vertical_media_id      uuid references public.media (id) on delete set null,
  add column if not exists ad_left_horizontal_media_id    uuid references public.media (id) on delete set null,
  add column if not exists ad_left_link                   text,
  add column if not exists ad_right_vertical_media_id     uuid references public.media (id) on delete set null,
  add column if not exists ad_right_horizontal_media_id   uuid references public.media (id) on delete set null,
  add column if not exists ad_right_link                  text;

-- ----------------------------------------------------------------------------
-- Seed: đúng giá trị thật đang chạy trong content/settings/site.yml, để
-- Dashboard/build.py đọc Supabase cho ra output giống hệt ngay sau khi
-- migrate (đúng tinh thần seed thật của Rev 7). ad_right_* để trống vì
-- site.yml hiện cũng để trống 2 trường đó.
-- ----------------------------------------------------------------------------
insert into public.media (url, type, caption, source_kind)
values
  ('/uploads/3968.png', 'image', 'Hero GIF — TNC Site Settings (migrate từ site.yml)', 'external_url'),
  ('/uploads/cf9462627f0c7e9736d84fd1e0e4f4a7.mp4', 'video', 'Quảng cáo trái — TNC Site Settings (migrate từ site.yml)', 'external_url')
on conflict (url) where deleted_at is null do nothing;

update public.site_settings set
  hero_gif_media_id           = (select id from public.media where url = '/uploads/3968.png' and deleted_at is null limit 1),
  hero_gif_song_title         = '',
  hero_gif_song_artist        = '',
  spotify_embed_url           = '',
  social_facebook             = 'https://www.facebook.com/share/1Ax4Jzy3kM/?mibextid=wwXIfr',
  social_instagram            = 'https://www.facebook.com/people/The-New-Culture/61590128262099/',
  social_youtube              = 'https://www.facebook.com/people/The-New-Culture/61590128262099/',
  social_tiktok               = 'https://www.facebook.com/people/The-New-Culture/61590128262099/',
  ad_left_vertical_media_id   = (select id from public.media where url = '/uploads/cf9462627f0c7e9736d84fd1e0e4f4a7.mp4' and deleted_at is null limit 1),
  ad_left_horizontal_media_id = (select id from public.media where url = '/uploads/cf9462627f0c7e9736d84fd1e0e4f4a7.mp4' and deleted_at is null limit 1),
  ad_left_link                = ''
where id = true
  and social_facebook is null; -- chỉ seed lần đầu — idempotent, không ghi đè sửa đổi sau này của editor

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--   select social_facebook, hero_gif_song_title, ad_left_link from public.site_settings;
-- ============================================================================
