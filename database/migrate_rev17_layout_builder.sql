-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 17: Dashboard V2 Phase 5 — Layout Builder
-- (Hệ thống Trình tạo Bố cục / Block Engine).
--
-- KIẾN TRÚC: Layout Builder KHÔNG phải Homepage Builder — đây là 1 Block
-- Engine kiểu plugin, tách 3 khái niệm:
--
--   layout_block_types — REGISTRY: danh mục các loại Khối đang tồn tại
--     (key ổn định dùng chung giữa Dashboard và build.py, label/description
--     tiếng Việt, config_schema mô tả field cấu hình để Dashboard TỰ SINH
--     form — không hardcode form theo từng loại khối). Không soft-delete
--     (giống bảng permissions) — registry chỉ Bật/Tắt (is_active), vì
--     layout_blocks tham chiếu tới key này (on delete restrict).
--
--   page_layouts — 1 hàng = 1 "trang" có bố cục quản lý được (page_key,
--     vd 'homepage'). Chỉ layout đang is_active=true mới được build.py dùng.
--
--   layout_blocks — các Khối THẬT trong 1 page_layout: thứ tự (sort_order),
--     bật/tắt (is_enabled), hiển thị theo thiết bị (visibility), điều kiện
--     hiển thị (visibility_condition), lịch chạy (starts_at/ends_at), độ ưu
--     tiên (priority — sort phụ sau sort_order khi trùng thứ tự), và cấu
--     hình riêng của khối (config jsonb, khớp config_schema của block type).
--
-- QUAN TRỌNG — "đăng ký Block không cần sửa kiến trúc" nghĩa là: phía
-- Dashboard (danh sách "Thêm Khối", form cấu hình) hoàn toàn đọc từ
-- layout_block_types, không hardcode. Phía build.py, MỖI block_type_key vẫn
-- cần đúng 1 hàm render Python tương ứng (BLOCK_RENDERERS trong build.py) —
-- không thể sinh HTML tuỳ ý từ thuần dữ liệu (trừ 2 loại "custom_html"/
-- "custom_markdown" là render thẳng từ config, không cần logic riêng). Vì
-- vậy "đăng ký module tương lai" là 2 bước: (1) thêm 1 hàng vào
-- layout_block_types (di chuyển được, không cần deploy code), (2) thêm 1 hàm
-- render vào build.py (cần deploy code) — đây là giới hạn vật lý của 1 static
-- site generator, không phải thiếu sót kiến trúc.
--
-- AN TOÀN SẢN XUẤT: migration này CHỈ thêm bảng mới — không đổi bất kỳ cột/
-- bảng nào hiện có, không đổi API, không đổi URL. build.py (xem PHẦN cuối
-- file này trong code) TỰ FALLBACK về render trang chủ y hệt hiện tại (hard-
-- code) nếu chưa có page_layouts nào active cho 'homepage' — nghĩa là NGAY
-- SAU KHI chạy phần schema/RLS của migration này (trước khi seed dữ liệu ở
-- PHẦN 4) website vẫn render giống hệt production. Idempotent toàn bộ.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PHẦN 1 — Bảng.
-- ----------------------------------------------------------------------------

create table if not exists public.layout_block_types (
  id             uuid primary key default gen_random_uuid(),
  key            text not null,
  label          text not null,
  description    text,
  icon           text,
  module         text,
  config_schema  jsonb not null default '[]'::jsonb,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint layout_block_types_key_not_blank check (btrim(key) <> ''),
  constraint layout_block_types_config_schema_is_array check (jsonb_typeof(config_schema) = 'array')
);
create unique index if not exists layout_block_types_key_key on public.layout_block_types (key);
create index if not exists layout_block_types_is_active_idx on public.layout_block_types (is_active);

drop trigger if exists trg_layout_block_types_updated_at on public.layout_block_types;
create trigger trg_layout_block_types_updated_at
  before update on public.layout_block_types
  for each row execute function public.set_updated_at();


create table if not exists public.page_layouts (
  id          uuid primary key default gen_random_uuid(),
  page_key    text not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint page_layouts_page_key_not_blank check (btrim(page_key) <> '')
);
create unique index if not exists page_layouts_page_key_key on public.page_layouts (page_key) where deleted_at is null;
create index if not exists page_layouts_deleted_at_idx on public.page_layouts (deleted_at);

drop trigger if exists trg_page_layouts_updated_at on public.page_layouts;
create trigger trg_page_layouts_updated_at
  before update on public.page_layouts
  for each row execute function public.set_updated_at();


create table if not exists public.layout_blocks (
  id                    uuid primary key default gen_random_uuid(),
  page_layout_id        uuid not null references public.page_layouts (id) on delete cascade,
  block_type_key        text not null references public.layout_block_types (key) on delete restrict,
  sort_order            integer not null default 0,
  is_enabled            boolean not null default true,
  -- Website tĩnh (build.py) không thể render 2 bản HTML khác nhau theo
  -- thiết bị lúc build — "Chỉ Desktop"/"Chỉ Mobile" được hiện thực bằng
  -- cách render CẢ 2, bọc trong class CSS ẩn theo @media (xem style.css:
  -- .layout-block--desktop-only/.layout-block--mobile-only), không phải
  -- lược bỏ HTML lúc build.
  visibility            text not null default 'all'
                         check (visibility in ('all', 'desktop', 'mobile', 'hidden')),
  -- 'always'/'manual_toggle': luôn tính hợp lệ (is_enabled quyết định hiện/
  -- ẩn). 'date_range': so starts_at/ends_at với thời điểm build. 4 điều kiện
  -- còn lại (has_content/has_promotion/has_magazine_issue/has_membership) —
  -- MỌI hàm render khối hiện có đã tự trả "" khi không đủ dữ liệu (nguyên
  -- tắc "render only if data exists" toàn bộ codebase), nên build.py áp
  -- dụng CHUNG 1 quy tắc "render trước, rỗng thì bỏ qua" cho cả 4 điều kiện
  -- này thay vì viết riêng từng nhánh — xem block_condition_met() build.py.
  visibility_condition  text not null default 'always'
                         check (visibility_condition in
                           ('always', 'manual_toggle', 'date_range', 'has_content',
                            'has_promotion', 'has_magazine_issue', 'has_membership')),
  starts_at             timestamptz,
  ends_at               timestamptz,
  -- Sort phụ SAU sort_order (không thay thế) — chỉ có tác dụng khi 2 khối
  -- trùng sort_order, priority cao hơn đứng trước. Trang chủ hiện là 1
  -- chuỗi khối tuần tự (không có nhiều khối "cạnh tranh" 1 vị trí như
  -- Campaign/Promotion), nên priority KHÔNG dùng để "chọn 1 trong nhiều" —
  -- chỉ là tie-breaker, để dành đúng nghĩa cho các kịch bản Layout Builder
  -- phức tạp hơn sau này (V2.1/V3).
  priority              integer not null default 0,
  config                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint layout_blocks_config_is_object check (jsonb_typeof(config) = 'object'),
  constraint layout_blocks_date_range_valid check (starts_at is null or ends_at is null or starts_at <= ends_at)
);
create index if not exists layout_blocks_page_layout_id_idx on public.layout_blocks (page_layout_id, sort_order);
create index if not exists layout_blocks_block_type_key_idx on public.layout_blocks (block_type_key);
create index if not exists layout_blocks_deleted_at_idx on public.layout_blocks (deleted_at);

drop trigger if exists trg_layout_blocks_updated_at on public.layout_blocks;
create trigger trg_layout_blocks_updated_at
  before update on public.layout_blocks
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- PHẦN 2 — Permission catalog: module "layout", 4 action chuẩn giống
-- authors/tags/hero/medals (Rev 13/14/16), cấp cho đúng những role đang
-- quản lý nội dung xuất bản (managing_editor/editor/reviewer) — cùng phạm vi
-- các module Publishing hiện có (hero/advertisements/promotions/
-- announcements), vì Layout Builder về bản chất là 1 module Publishing.
-- ----------------------------------------------------------------------------

insert into public.permissions (module, action, key, description)
values
  ('layout', 'view', 'layout.view', 'Xem Bố cục Website (Layout Builder)'),
  ('layout', 'create', 'layout.create', 'Thêm Khối / tạo Bố cục Trang mới'),
  ('layout', 'edit', 'layout.edit', 'Sửa/sắp xếp/cấu hình Khối, quản lý Danh mục Khối'),
  ('layout', 'delete', 'layout.delete', 'Xoá Khối / xoá Bố cục Trang')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'administrator' and p.key <> 'permissions.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'managing_editor' and p.module = 'layout'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'editor' and p.module = 'layout' and p.action in ('view', 'create', 'edit')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'reviewer' and p.module = 'layout' and p.action = 'view'
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 3 — RLS.
-- ----------------------------------------------------------------------------

alter table public.layout_block_types enable row level security;
alter table public.page_layouts       enable row level security;
alter table public.layout_blocks      enable row level security;

-- layout_block_types: CHỈ Dashboard đọc (build.py không cần — build.py có
-- registry Python riêng BLOCK_RENDERERS, layout_block_types chỉ phục vụ
-- form "Thêm Khối"/cấu hình phía editor) — không có policy Public read.
drop policy if exists "Editors can view all layout_block_types" on public.layout_block_types;
create policy "Editors can view all layout_block_types" on public.layout_block_types
  for select to authenticated using (public.is_active_editor() and public.has_permission('layout.view'));
drop policy if exists "Editors can insert layout_block_types" on public.layout_block_types;
create policy "Editors can insert layout_block_types" on public.layout_block_types
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('layout.create'));
drop policy if exists "Editors can update layout_block_types" on public.layout_block_types;
create policy "Editors can update layout_block_types" on public.layout_block_types
  for update to authenticated
  using (public.is_active_editor() and public.has_permission('layout.edit'))
  with check (public.is_active_editor() and public.has_permission('layout.edit'));

-- page_layouts: Public read chỉ layout đang active (build.py, SUPABASE_ANON_KEY).
drop policy if exists "Public read active page_layouts" on public.page_layouts;
create policy "Public read active page_layouts" on public.page_layouts
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all page_layouts" on public.page_layouts;
create policy "Editors can view all page_layouts" on public.page_layouts
  for select to authenticated using (public.is_active_editor() and public.has_permission('layout.view'));
drop policy if exists "Editors can insert page_layouts" on public.page_layouts;
create policy "Editors can insert page_layouts" on public.page_layouts
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('layout.create'));
drop policy if exists "Editors can update page_layouts" on public.page_layouts;
create policy "Editors can update page_layouts" on public.page_layouts
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('layout.edit') or public.has_permission('layout.delete')))
  with check (public.is_active_editor() and (public.has_permission('layout.edit') or public.has_permission('layout.delete')));

-- layout_blocks: Public read chỉ khối is_enabled=true, chưa xoá, của layout
-- đang active — build.py TỰ áp dụng thêm visibility/visibility_condition/
-- lịch chạy ở tầng Python (không cần nhồi hết logic thời gian vào RLS).
drop policy if exists "Public read enabled layout_blocks" on public.layout_blocks;
create policy "Public read enabled layout_blocks" on public.layout_blocks
  for select using (
    deleted_at is null and is_enabled = true
    and exists (
      select 1 from public.page_layouts pl
      where pl.id = layout_blocks.page_layout_id and pl.deleted_at is null and pl.is_active = true
    )
  );

drop policy if exists "Editors can view all layout_blocks" on public.layout_blocks;
create policy "Editors can view all layout_blocks" on public.layout_blocks
  for select to authenticated using (public.is_active_editor() and public.has_permission('layout.view'));
drop policy if exists "Editors can insert layout_blocks" on public.layout_blocks;
create policy "Editors can insert layout_blocks" on public.layout_blocks
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('layout.create'));
drop policy if exists "Editors can update layout_blocks" on public.layout_blocks;
create policy "Editors can update layout_blocks" on public.layout_blocks
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('layout.edit') or public.has_permission('layout.delete')))
  with check (public.is_active_editor() and (public.has_permission('layout.edit') or public.has_permission('layout.delete')));
drop policy if exists "Editors can delete layout_blocks" on public.layout_blocks;
create policy "Editors can delete layout_blocks" on public.layout_blocks
  for delete to authenticated using (public.is_active_editor() and public.has_permission('layout.delete'));


-- ----------------------------------------------------------------------------
-- PHẦN 4 — Registry seed: đúng các Khối build.py ĐÃ có hàm render sẵn (xem
-- BLOCK_RENDERERS trong build.py) — không đăng ký khối nào chưa có renderer
-- thật (vd Podcast/Video/Sự kiện/Membership — module chưa tồn tại, để dành
-- V2.1/V3 theo đúng nguyên tắc "không tạo dữ liệu/tính năng giả"). 2 khối
-- custom_html/custom_markdown render thẳng từ config, không phụ thuộc module
-- nào khác — ví dụ cụ thể cho "module tương lai đăng ký Block mà không cần
-- sửa build.py nếu chỉ cần HTML/Markdown tĩnh".
-- ----------------------------------------------------------------------------

insert into public.layout_block_types (key, label, description, module, config_schema, sort_order)
values
  ('gif_hero', 'Khối GIF Hero', 'Banner GIF/video đầu trang — nội dung quản lý ở Hero Manager.', 'hero', '[]'::jsonb, 10),
  ('spotify', 'Khối Spotify', 'Nhúng Spotify player — cấu hình ở Site Settings.', 'settings', '[]'::jsonb, 20),
  ('hero', 'Khối Hero', 'Slideshow 3 bài nổi bật đầu trang — nội dung quản lý ở Hero Manager (hero_priority).', 'hero', '[]'::jsonb, 30),
  ('featured_story', 'Tin nổi bật', 'Bài viết Cover Story — tự chọn bài "Nổi bật" mới nhất, có thể ghim tay 1 bài cụ thể.', 'articles',
    '[{"key":"manual_slug","type":"article_select","label":"Ghim bài cụ thể (để trống = tự động chọn)"}]'::jsonb, 40),
  ('magazine', 'Khối Tạp chí', 'Số TNC Magazine mới nhất — nội dung quản lý ở TNC Magazine.', 'magazine', '[]'::jsonb, 50),
  ('trending', 'Đang được quan tâm', 'Danh sách bài viết đang nổi bật.', 'articles',
    '[{"key":"limit","type":"number","label":"Số lượng bài","default":6,"min":1,"max":12}]'::jsonb, 60),
  ('ranking_spotlight', 'Bảng xếp hạng', 'Bảng xếp hạng TNC Selects mới nhất.', 'tnc_selects', '[]'::jsonb, 70),
  ('profiles_homepage', 'Hồ sơ nổi bật', 'Hồ sơ nghệ sĩ nổi bật — nội dung quản lý ở hồ sơ nghệ sĩ.', 'profiles', '[]'::jsonb, 80),
  ('community_homepage', 'Cộng đồng', 'Bài viết cộng đồng nổi bật (TNC Community).', 'community', '[]'::jsonb, 90),
  ('series_grid', 'Khối Series', '16 Series — bản đồ tri thức TNC.', 'series', '[]'::jsonb, 100),
  ('homepage_ad', 'Khối Quảng cáo', 'Banner quảng cáo — nội dung quản lý ở Advertisement Manager.', 'advertisements', '[]'::jsonb, 110),
  ('latest_articles', 'Bài viết mới', 'Lưới bài viết — chọn nguồn dữ liệu, số lượng, số cột, hiển thị ảnh/mô tả/ngày.', 'articles',
    '[
      {"key":"title","type":"text","label":"Tiêu đề khối","default":"Mới đăng"},
      {"key":"data_source","type":"select","label":"Nguồn dữ liệu","default":"latest","options":[
        {"value":"latest","label":"Mới nhất"},
        {"value":"most_viewed","label":"Xem nhiều"},
        {"value":"manual","label":"Thủ công"},
        {"value":"random","label":"Ngẫu nhiên"},
        {"value":"by_series","label":"Theo Series"},
        {"value":"by_category","label":"Theo Danh mục"},
        {"value":"by_tag","label":"Theo Thẻ"}
      ]},
      {"key":"series_slug","type":"series_select","label":"Series","show_if":{"data_source":"by_series"}},
      {"key":"category_slug","type":"category_select","label":"Danh mục","show_if":{"data_source":"by_category"}},
      {"key":"tag","type":"text","label":"Thẻ","show_if":{"data_source":"by_tag"}},
      {"key":"manual_slugs","type":"article_multiselect","label":"Chọn bài viết","show_if":{"data_source":"manual"}},
      {"key":"limit","type":"number","label":"Số lượng bài","default":6,"min":1,"max":24},
      {"key":"columns_desktop","type":"number","label":"Số cột Desktop","default":3,"min":1,"max":4},
      {"key":"columns_mobile","type":"number","label":"Số cột Mobile","default":1,"min":1,"max":2},
      {"key":"show_image","type":"boolean","label":"Hiển thị ảnh","default":true},
      {"key":"show_excerpt","type":"boolean","label":"Hiển thị mô tả","default":false},
      {"key":"show_date","type":"boolean","label":"Hiển thị ngày","default":true}
    ]'::jsonb, 120),
  ('custom_html', 'HTML tùy chỉnh', 'Chèn khối HTML tự do — dùng cho nội dung/nhúng đặc biệt.', 'custom',
    '[{"key":"html","type":"textarea","label":"Mã HTML"}]'::jsonb, 900),
  ('custom_markdown', 'Markdown tùy chỉnh', 'Chèn khối nội dung Markdown tự do.', 'custom',
    '[{"key":"markdown","type":"textarea","label":"Nội dung Markdown"}]'::jsonb, 910)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  module = excluded.module,
  config_schema = excluded.config_schema,
  sort_order = excluded.sort_order;
-- "on conflict do update" (thay vì "do nothing"): registry seed này chính là
-- nguồn sự thật cho label/config_schema — chạy lại migration (vd sau khi
-- sửa mô tả 1 khối) phải áp dụng lại đúng, không bị kẹt ở lần seed đầu tiên.
-- KHÔNG đụng tới is_active — nếu biên tập viên đã tự tắt 1 loại khối, chạy
-- lại migration không được tự bật lại.


-- ----------------------------------------------------------------------------
-- PHẦN 5 — Seed page_layouts + layout_blocks cho 'homepage', ĐÚNG thứ tự
-- hiện có trong build.py (render_index()) tại thời điểm viết migration này —
-- để Dashboard "Bố cục Website" phản ánh đúng trang chủ thật ngay từ đầu,
-- và để có dữ liệu thật kiểm tra "Layout Builder render ra y hệt bản
-- hardcode cũ" (xem báo cáo). Idempotent: "on conflict do nothing" theo
-- unique (page_layout_id, block_type_key) — chỉ insert 1 lần, các lần sau
-- không đè lên chỉnh sửa thủ công của biên tập viên.
-- ----------------------------------------------------------------------------

insert into public.page_layouts (page_key, name, is_active)
values ('homepage', 'Bố cục Trang chủ', true)
on conflict (page_key) where deleted_at is null do nothing;

do $$
declare
  v_layout_id uuid;
begin
  select id into v_layout_id from public.page_layouts where page_key = 'homepage' and deleted_at is null;

  if v_layout_id is not null and not exists (
    select 1 from public.layout_blocks where page_layout_id = v_layout_id
  ) then
    insert into public.layout_blocks (page_layout_id, block_type_key, sort_order)
    values
      (v_layout_id, 'gif_hero', 10),
      (v_layout_id, 'spotify', 20),
      (v_layout_id, 'hero', 30),
      (v_layout_id, 'featured_story', 40),
      (v_layout_id, 'magazine', 50),
      (v_layout_id, 'trending', 60),
      (v_layout_id, 'ranking_spotlight', 70),
      (v_layout_id, 'profiles_homepage', 80),
      (v_layout_id, 'community_homepage', 90),
      (v_layout_id, 'series_grid', 100),
      (v_layout_id, 'homepage_ad', 110),
      (v_layout_id, 'latest_articles', 120);
  end if;
end $$;

-- ============================================================================
-- HẾT Rev 17.
-- ============================================================================
