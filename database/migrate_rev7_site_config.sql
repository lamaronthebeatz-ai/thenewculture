-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 7: Site Settings + Menu + Footer
-- (CMS V2 Phase 2 — Module 11, Module 8, Module 9, theo đúng Architecture
-- Report đã duyệt)
--
-- Phạm vi ĐÚNG những gì đã duyệt, không mở rộng:
--   - site_settings: các trường site-wide mà build.py hiện đang hardcode
--     (SITE_NAME/SITE_DESC) hoặc đọc từ content/settings/site.yml (logo,
--     header_bg_image, cloudflare_analytics_token). KHÔNG bao gồm
--     hero_gif/spotify_embed_url/social_*/ad_* — những trường đó vẫn thuộc
--     site.yml, sẽ chuyển ở Phase 3 (Hero Manager/Advertisement Manager).
--   - menus/menu_items: đăng ký đúng 5 loại menu theo thiết kế (header_
--     primary, header_mega, footer, social, quick_link). Phase này CHỈ
--     wire build.py đọc 2 key "header_primary" (thay NAV_ITEMS) và
--     "footer" (thay cột liên kết footer hardcode) — 3 key còn lại
--     (header_mega, social, quick_link) đã có sẵn chỗ trong Dashboard để
--     dùng sau, chưa đụng tới trong build.py ở phase này.
--   - footer_settings/footer_partners: text + đối tác chân trang.
--
-- Xoá: thống nhất Soft Delete toàn hệ thống (quyết định đã chốt) — kể cả
-- menu_items (khác bản nháp thiết kế ban đầu là hard-delete).
--
-- File này KHÔNG sửa database/schema.sql, đúng quy ước từ Rev 5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. site_settings — singleton (đúng 1 dòng duy nhất, ép bằng PK boolean)
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id                    boolean primary key default true check (id),
  site_name             text,
  site_description      text,
  robots_directives     text,
  logo_media_id         uuid references public.media (id) on delete set null,
  header_bg_media_id    uuid references public.media (id) on delete set null,
  favicon_media_id      uuid references public.media (id) on delete set null,
  default_og_image_id   uuid references public.media (id) on delete set null,
  cloudflare_analytics_token text,
  theme                 jsonb not null default '{}'::jsonb,
  maintenance_mode      boolean not null default false,
  maintenance_message   text,
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. menus — danh mục 5 loại menu hợp lệ (đúng thiết kế Module 8)
-- ----------------------------------------------------------------------------
create table if not exists public.menus (
  id      uuid primary key default gen_random_uuid(),
  key     text not null,
  label   text not null
);
create unique index if not exists menus_key_key on public.menus (key);

insert into public.menus (key, label) values
  ('header_primary', 'Menu chính (đầu trang)'),
  ('header_mega',    'Mega Menu (Khám phá / Tổ chức)'),
  ('footer',         'Menu chân trang'),
  ('social',         'Mạng xã hội'),
  ('quick_link',     'Liên kết nhanh')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. menu_items — soft delete, phân cấp 2 cấp qua parent_id
-- ----------------------------------------------------------------------------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.menus (id) on delete cascade,
  parent_id   uuid references public.menu_items (id) on delete cascade,
  label       text not null,
  link_kind   text not null default 'custom_path'
              check (link_kind in ('series', 'category', 'article', 'external', 'custom_path')),
  link_value  text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint menu_items_not_self_parent check (parent_id is distinct from id)
);

create index if not exists menu_items_menu_id_idx on public.menu_items (menu_id, sort_order);
create index if not exists menu_items_parent_id_idx on public.menu_items (parent_id);
create index if not exists menu_items_deleted_at_idx on public.menu_items (deleted_at);

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. footer_settings — singleton, đúng mẫu site_settings
-- ----------------------------------------------------------------------------
create table if not exists public.footer_settings (
  id              boolean primary key default true check (id),
  description     text,
  copyright_text  text,
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_footer_settings_updated_at on public.footer_settings;
create trigger trg_footer_settings_updated_at
  before update on public.footer_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. footer_partners — chưa có dữ liệu hiện tại (tính năng mới), bảng rỗng
--    sau migration là đúng — build.py chỉ render khối này nếu có dòng active
-- ----------------------------------------------------------------------------
create table if not exists public.footer_partners (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  logo_media_id   uuid references public.media (id) on delete set null,
  link_url        text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists footer_partners_active_idx
  on public.footer_partners (is_active, sort_order) where deleted_at is null;

drop trigger if exists trg_footer_partners_updated_at on public.footer_partners;
create trigger trg_footer_partners_updated_at
  before update on public.footer_partners
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RLS — đúng mẫu is_active_editor() đã kiểm chứng ở Rev 5/Rev 6
-- ----------------------------------------------------------------------------
alter table public.site_settings   enable row level security;
alter table public.menus           enable row level security;
alter table public.menu_items      enable row level security;
alter table public.footer_settings enable row level security;
alter table public.footer_partners enable row level security;

drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings" on public.site_settings
  for select using (true);   -- không có dữ liệu nhạy cảm (analytics token đã public trong <script> hiện tại)

drop policy if exists "Editors can update site settings" on public.site_settings;
create policy "Editors can update site settings" on public.site_settings
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Public read menus" on public.menus;
create policy "Public read menus" on public.menus
  for select using (true);

drop policy if exists "Public read menu_items" on public.menu_items;
create policy "Public read menu_items" on public.menu_items
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all menu_items" on public.menu_items;
create policy "Editors can view all menu_items" on public.menu_items
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert menu_items" on public.menu_items;
create policy "Editors can insert menu_items" on public.menu_items
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update menu_items" on public.menu_items;
create policy "Editors can update menu_items" on public.menu_items
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Public read footer settings" on public.footer_settings;
create policy "Public read footer settings" on public.footer_settings
  for select using (true);

drop policy if exists "Editors can update footer settings" on public.footer_settings;
create policy "Editors can update footer settings" on public.footer_settings
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Public read footer partners" on public.footer_partners;
create policy "Public read footer partners" on public.footer_partners
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all footer partners" on public.footer_partners;
create policy "Editors can view all footer partners" on public.footer_partners
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert footer partners" on public.footer_partners;
create policy "Editors can insert footer partners" on public.footer_partners
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update footer partners" on public.footer_partners;
create policy "Editors can update footer partners" on public.footer_partners
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 7. Data migration — seed ĐÚNG giá trị thật đang chạy hôm nay, để sau khi
--    chạy migration này, output HTML không đổi 1 ký tự nào so với trước
--    (site_name/site_description/copyright hiện đã trùng khớp hằng số
--    Python; logo/header_bg trỏ vào đúng ảnh /uploads hiện có qua bảng
--    media, không upload lại; cloudflare_analytics_token copy nguyên giá
--    trị đang cấu hình trong content/settings/site.yml hôm nay).
--
--    KHÔNG seed menu_items (header_primary/footer) — Menu/Footer Builder
--    chủ động dùng fallback hardcode trong build.py cho tới khi editor
--    thật sự nhập liệu qua Dashboard, đúng yêu cầu "nếu database chưa có
--    menu thì website vẫn hoạt động như hiện tại".
-- ----------------------------------------------------------------------------
insert into public.media (url, type, caption, source_kind)
values
  ('/uploads/3951.png', 'image', 'Logo — TNC Site Settings (migrate từ site.yml)', 'external_url'),
  ('/uploads/3963.png', 'image', 'Header background — TNC Site Settings (migrate từ site.yml)', 'external_url')
on conflict (url) where deleted_at is null do nothing;

insert into public.site_settings (id, site_name, site_description, cloudflare_analytics_token, logo_media_id, header_bg_media_id)
select
  true,
  'The New Culture',
  'Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam.',
  '6b80305f19b5403ea2a03d427a03dcb7',
  (select id from public.media where url = '/uploads/3951.png' and deleted_at is null limit 1),
  (select id from public.media where url = '/uploads/3963.png' and deleted_at is null limit 1)
on conflict (id) do nothing;

insert into public.footer_settings (id, description, copyright_text)
values (
  true,
  'Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam. Lưu giữ để không giá trị nào bị lãng quên.',
  '© 2026 The New Culture — Bản demo'
)
on conflict (id) do nothing;

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc, chỉ để kiểm tra):
--
--   select * from public.site_settings;
--   select * from public.footer_settings;
--   select key, label from public.menus order by key;
--
--   -- Backward-compat: build.py vẫn phải build ra ĐÚNG site_name/header_bg
--   -- hiện tại nếu chưa migrate build.py (trước khi merge PR Phase 2 code):
--   -- các cột mới không ảnh hưởng gì tới articles/authors/series/... hiện có.
-- ============================================================================
