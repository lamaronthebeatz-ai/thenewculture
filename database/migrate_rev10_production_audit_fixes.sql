-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 10: Production Audit fixes (Phase 1-4).
-- Chỉ sửa lỗi thật đã xác minh bằng bằng chứng cụ thể trong audit toàn diện
-- Phase 1-4 (không mở rộng phạm vi, không đổi kiến trúc, không thêm tính
-- năng mới). Mỗi mục dưới đây độc lập, không phụ thuộc lẫn nhau.
--
-- File này KHÔNG sửa database/schema.sql hay bất kỳ migrate_rev5-9 nào,
-- đúng quy ước đã áp dụng từ Rev 5 — không sửa migration đã chạy production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS — categories/series/tags/media/media_folders thiếu policy "Editors
--    can view all X" (đã có sẵn cho articles/authors/menu_items/hero_slots/
--    ads/promotions/announcements/media_tags — chỉ 5 bảng này bị bỏ sót ở
--    Rev 5/Rev 6). Hậu quả đã xác minh: policy public duy nhất
--    `using (deleted_at is null)` khiến RLS lọc rỗng cả với editor đã đăng
--    nhập, nên checkbox "Hiện cả ... đã xoá" (CategoriesList.jsx/
--    SeriesList.jsx/TagsList.jsx/MediaList.jsx) và trang Sửa (CategoryForm/
--    SeriesForm/MediaForm, load theo .eq("id", id) không lọc deleted_at)
--    không đọc được các dòng đã soft-delete — tính năng khôi phục vỡ hoàn
--    toàn dù UI đã build đủ.
-- ----------------------------------------------------------------------------
drop policy if exists "Editors can view all categories" on public.categories;
create policy "Editors can view all categories" on public.categories
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can view all series" on public.series;
create policy "Editors can view all series" on public.series
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can view all tags" on public.tags;
create policy "Editors can view all tags" on public.tags
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can view all media" on public.media;
create policy "Editors can view all media" on public.media
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can view all media folders" on public.media_folders;
create policy "Editors can view all media folders" on public.media_folders
  for select to authenticated using (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 2. menu_items.menu_id/parent_id dùng "on delete cascade" — mâu thuẫn trực
--    tiếp với chính tuyên bố thiết kế trong migrate_rev7_site_config.sql
--    ("thống nhất Soft Delete toàn hệ thống — kể cả menu_items") và khác
--    quy ước đã dùng cho categories.parent_id/media_folders.parent_id (cả
--    hai đều "on delete set null"). Nếu service_role hard-delete 1 dòng
--    `menus` hoặc 1 menu_item cha, cascade sẽ xoá cứng toàn bộ menu_items
--    con — kể cả các dòng đang active (deleted_at is null) — không hề đi
--    qua soft-delete. menus chỉ có đúng 5 dòng catalog cố định (không có
--    policy ghi cho editor) nên dùng "restrict" thay vì "set null" (menu_id
--    not null, không có menu "không xác định" hợp lệ).
-- ----------------------------------------------------------------------------
alter table public.menu_items drop constraint if exists menu_items_menu_id_fkey;
alter table public.menu_items
  add constraint menu_items_menu_id_fkey
  foreign key (menu_id) references public.menus (id) on delete restrict;

alter table public.menu_items drop constraint if exists menu_items_parent_id_fkey;
alter table public.menu_items
  add constraint menu_items_parent_id_fkey
  foreign key (parent_id) references public.menu_items (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3. promotions.placement là text tự do, không CHECK, không FK — khác mọi
--    cột enum-text khác trong cùng file (hero_slots.kind/animation,
--    ads.creative_kind/link_target đều có CHECK; ads.placement_id là FK
--    thật). Đã xác minh khai thác cụ thể: PromotionManager.jsx dùng <input>
--    text tự do (chỉ placeholder gợi ý "sticky_bottom"), trong khi
--    scripts/build.py so khớp CHÍNH XÁC 1 chuỗi literal
--    (pick_active_campaign: c["placement"] == placement). Gõ sai 1 ký tự
--    (hoa/thường, khoảng trắng thừa) khiến promotion lưu thành công, hiện
--    trong Dashboard, nhưng KHÔNG BAO GIỜ render trên site — không có cảnh
--    báo nào. Chỉ ràng buộc đúng giá trị build.py đang thực sự dùng; mở
--    rộng thêm giá trị sau này chỉ cần sửa CHECK này (đúng cách các CHECK
--    khác trong file đang làm).
-- ----------------------------------------------------------------------------
alter table public.promotions drop constraint if exists promotions_placement_check;
alter table public.promotions
  add constraint promotions_placement_check check (placement in ('sticky_bottom'));

-- ----------------------------------------------------------------------------
-- 4. Index còn thiếu cho các cột FK trỏ tới media(id) thêm ở Rev 7/8 (mọi
--    cột FK trỏ media(id) từ Rev 1/Rev 6 đều đã có index riêng — chỉ các
--    cột thêm sau đó bị bỏ sót). Các cột này đều "on delete set null": khi
--    một dòng media bị xoá cứng, thiếu index nghĩa là full-table scan trên
--    từng bảng con để tìm dòng cần set null. Không thêm cho
--    site_settings.*_media_id (bảng singleton đúng 1 dòng — index không
--    mang lại lợi ích gì, tránh sửa lỗi không có thật).
-- ----------------------------------------------------------------------------
create index if not exists footer_partners_logo_media_id_idx
  on public.footer_partners (logo_media_id);
create index if not exists hero_slots_desktop_media_id_idx
  on public.hero_slots (desktop_media_id);
create index if not exists hero_slots_mobile_media_id_idx
  on public.hero_slots (mobile_media_id);
create index if not exists ads_media_id_idx
  on public.ads (media_id);
create index if not exists promotions_media_id_idx
  on public.promotions (media_id);
create index if not exists promotions_mobile_media_id_idx
  on public.promotions (mobile_media_id);

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--   select tablename, policyname from pg_policies where schemaname='public'
--     and tablename in ('categories','series','tags','media','media_folders')
--     order by tablename, policyname;
--   select conname, confdeltype from pg_constraint
--     where conrelid = 'public.menu_items'::regclass and contype = 'f';
--     -- confdeltype: 'a' = restrict, 'n' = set null (không còn 'c' = cascade)
--   select conname from pg_constraint
--     where conrelid = 'public.promotions'::regclass and conname = 'promotions_placement_check';
-- ============================================================================
