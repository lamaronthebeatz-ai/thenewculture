-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 6: Media Library (CMS V2, Module 1)
--
-- Bối cảnh: theo thiết kế CMS V2 đã duyệt (Audit & Design Report), bảng
-- media hiện có (Rev 1) chỉ đủ cho "1 ảnh gắn 1 bài viết" (url, type,
-- alt_text, width, height, size_bytes, uploaded_by, article_id) — không có
-- folder, caption, credit, metadata, tag, hay cách tìm "ảnh này đang dùng ở
-- đâu". Rev 6 mở rộng CỘNG THÊM, không sửa/xoá bất kỳ cột nào đang có, để
-- Dashboard module Media hiện tại (dashboard/src/pages/MediaList.jsx,
-- MediaForm.jsx) tiếp tục hoạt động không cần sửa 1 dòng nếu chưa nâng cấp
-- UI ngay.
--
-- File này KHÔNG sửa database/schema.sql — đúng quy ước đã áp dụng từ
-- Rev 5: mọi thay đổi CMS V2 nằm ở migration riêng, an toàn chạy lại
-- nhiều lần (idempotent).
--
-- Quy ước xoá: theo quyết định thống nhất Soft Delete cho TOÀN BỘ hệ
-- thống (không có ngoại lệ) — media_folders có deleted_at như mọi bảng
-- khác. media_tags là bảng nối thuần (giống article_tags đã có), không có
-- deleted_at, gỡ 1 thẻ khỏi 1 ảnh là DELETE thật đúng bản chất bảng nối,
-- không phải "xoá nội dung".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. media_folders — cây thư mục cho Media Library
-- ----------------------------------------------------------------------------
create table if not exists public.media_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.media_folders (id) on delete set null,
  name        text not null,
  slug        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint media_folders_not_self_parent check (parent_id is distinct from id)
);

create unique index if not exists media_folders_slug_key on public.media_folders (slug) where deleted_at is null;
create index if not exists media_folders_parent_id_idx on public.media_folders (parent_id);
create index if not exists media_folders_deleted_at_idx on public.media_folders (deleted_at);

drop trigger if exists trg_media_folders_updated_at on public.media_folders;
create trigger trg_media_folders_updated_at
  before update on public.media_folders
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. media — thêm cột mới (đều nullable hoặc có DEFAULT, không phá dữ liệu
--    hiện có, không đổi kiểu/tên cột cũ)
-- ----------------------------------------------------------------------------
alter table public.media
  add column if not exists folder_id   uuid references public.media_folders (id) on delete set null,
  add column if not exists caption     text,
  add column if not exists credit      text,     -- ghi công / photographer
  add column if not exists source_kind text not null default 'upload'
                          check (source_kind in ('upload', 'external_url')),
  add column if not exists metadata    jsonb not null default '{}'::jsonb;

create index if not exists media_folder_id_idx on public.media (folder_id);

-- ----------------------------------------------------------------------------
-- 3. media_tags — bảng nối N-N media <-> tags (tái dùng bảng tags hiện có,
--    không tạo hệ thống tag riêng cho ảnh — đúng khuôn article_tags)
-- ----------------------------------------------------------------------------
create table if not exists public.media_tags (
  media_id    uuid not null references public.media (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (media_id, tag_id)
);

create index if not exists media_tags_tag_id_idx on public.media_tags (tag_id);
create index if not exists media_tags_media_id_idx on public.media_tags (media_id);

-- ----------------------------------------------------------------------------
-- 4. RLS — đúng mẫu đã kiểm chứng ở Rev 5 (is_active_editor() đã tồn tại,
--    không tạo lại)
-- ----------------------------------------------------------------------------
alter table public.media_folders enable row level security;
alter table public.media_tags    enable row level security;

-- media_folders: đọc công khai (giống categories/series — không có dữ liệu
-- nhạy cảm, chỉ là tên thư mục), ghi chỉ editor.
drop policy if exists "Public read media folders" on public.media_folders;
create policy "Public read media folders" on public.media_folders
  for select using (deleted_at is null);

drop policy if exists "Editors can insert media folders" on public.media_folders;
create policy "Editors can insert media folders" on public.media_folders
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update media folders" on public.media_folders;
create policy "Editors can update media folders" on public.media_folders
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- media_tags: đọc công khai theo đúng media đang public (giống
-- article_tags lọc theo status='published' của bài viết cha) — ở đây
-- media không có "published", chỉ có deleted_at, nên điều kiện là ảnh
-- chưa bị xoá mềm.
drop policy if exists "Public read media_tags of visible media" on public.media_tags;
create policy "Public read media_tags of visible media" on public.media_tags
  for select using (
    exists (
      select 1 from public.media m
      where m.id = media_tags.media_id
        and m.deleted_at is null
    )
  );

drop policy if exists "Editors can view all media_tags" on public.media_tags;
create policy "Editors can view all media_tags" on public.media_tags
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert media_tags" on public.media_tags;
create policy "Editors can insert media_tags" on public.media_tags
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can delete media_tags" on public.media_tags;
create policy "Editors can delete media_tags" on public.media_tags
  for delete to authenticated using (public.is_active_editor());

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc, chỉ để kiểm tra):
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'media'
--   order by ordinal_position;
--
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in ('media_folders','media_tags')
--   order by tablename, cmd;
--
--   -- Backward-compat: query kiểu Dashboard hiện tại (MediaList.jsx) vẫn
--   -- phải chạy đúng không lỗi, không cần đổi field nào:
--   select id, url, type, alt_text, deleted_at from public.media limit 1;
-- ============================================================================
