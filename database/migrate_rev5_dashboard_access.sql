-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 5: TNC Dashboard — quyền ghi cho editor
--
-- Bối cảnh: TNC Dashboard (app React/Vite riêng, xem dashboard/) đăng nhập
-- editor qua Supabase Auth rồi ghi trực tiếp vào 7 bảng lõi bằng session của
-- chính editor đó (role Postgres "authenticated"), KHÔNG dùng service_role
-- (service_role tuyệt đối không được nhúng vào code phía client). Trước Rev
-- 5, 7 bảng lõi chỉ có policy SELECT công khai (đọc nội dung đã publish) —
-- "authenticated" không đọc/ghi thêm được gì, chỉ service_role (bỏ qua RLS)
-- mới ghi được. Rev 5 bổ sung đúng phần còn thiếu này (đã dự kiến sẵn ở đề
-- xuất #12 trong ARCHITECTURE_REVIEW.md).
--
-- Cách xác định "ai là editor": KHÔNG thêm cột mới vào authors (giữ đúng cấu
-- trúc bảng hiện có) — is_active_editor() xác định editor bằng cách khớp
-- email của auth.users hiện tại (auth.uid()) với 1 dòng authors.email đang
-- active (deleted_at is null). Mỗi editor được cấp 1 tài khoản Supabase Auth
-- dùng đúng email đã có sẵn trong hồ sơ authors của họ.
--
-- Phát hiện khi build Dashboard (module Articles): policy INSERT/UPDATE ban
-- đầu KHÔNG đủ — editor đăng nhập xong không đọc lại được draft/review/
-- scheduled/archived vừa tạo/sửa, vì policy SELECT công khai trên articles
-- chỉ cho đọc status='published' (và trên authors chỉ cho đọc is_active=
-- true). Rev 5 vì vậy có thêm 2 policy SELECT riêng cho editor (đọc TOÀN BỘ
-- articles/authors bất kể status/is_active/deleted_at) bên cạnh INSERT/
-- UPDATE — không có phần SELECT này, Dashboard sẽ ghi được nhưng không hiển
-- thị lại được chính dữ liệu vừa thao tác.
--
-- Phạm vi cấp quyền ghi: INSERT + UPDATE (không cấp DELETE thật) cho 6 bảng
-- có deleted_at — "xoá" trên Dashboard là soft-delete (UPDATE set
-- deleted_at), đúng quy ước đã có của toàn bộ schema, nên UPDATE là đủ,
-- không cần mở DELETE thật (chỉ service_role mới hard-delete được, dùng cho
-- dọn dẹp admin ngoài Dashboard). Riêng article_tags là bảng nối thuần
-- KHÔNG có deleted_at (theo đúng thiết kế ban đầu — "không có vòng đời
-- riêng"), nên gỡ 1 tag khỏi bài viết bắt buộc phải là DELETE thật + không
-- cần UPDATE (sửa 1 dòng nối không có ý nghĩa, luôn xoá rồi thêm lại).
--
-- Không phân quyền theo "chỉ sửa bài của chính mình" — Dashboard giai đoạn 1
-- là công cụ nội bộ dùng chung cho toàn bộ ban biên tập, mọi editor active
-- đều thao tác được trên mọi dòng.
--
-- File này KHÔNG sửa database/schema.sql — theo yêu cầu, mọi thay đổi Rev 5
-- chỉ nằm ở đây (migration ALTER/CREATE POLICY, an toàn chạy lại nhiều lần).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hàm xác định editor đang active (security definer — authenticated
--    không có quyền SELECT trực tiếp trên toàn bộ auth.users)
-- ----------------------------------------------------------------------------
create or replace function public.is_active_editor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.authors a on lower(a.email) = lower(u.email)
    where u.id = auth.uid()
      and a.deleted_at is null
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. articles — SELECT toàn bộ (mọi status, kể cả đã soft-delete) + INSERT +
--    UPDATE cho editor. Chính sách SELECT công khai hiện có (chỉ status=
--    'published') vẫn giữ nguyên bên cạnh, không thay thế.
-- ----------------------------------------------------------------------------
drop policy if exists "Editors can view all articles" on public.articles;
create policy "Editors can view all articles" on public.articles
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert articles" on public.articles;
create policy "Editors can insert articles" on public.articles
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update articles" on public.articles;
create policy "Editors can update articles" on public.articles
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 3. authors — SELECT toàn bộ (kể cả is_active=false/đã soft-delete) +
--    INSERT + UPDATE cho editor.
-- ----------------------------------------------------------------------------
drop policy if exists "Editors can view all authors" on public.authors;
create policy "Editors can view all authors" on public.authors
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert authors" on public.authors;
create policy "Editors can insert authors" on public.authors
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update authors" on public.authors;
create policy "Editors can update authors" on public.authors
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 4. categories/series/tags/media — policy SELECT công khai hiện có (chỉ
--    lọc deleted_at is null, không có điều kiện thu hẹp nào khác như status/
--    is_active) đã đủ cho editor đọc mọi dòng đang hoạt động — chỉ cần thêm
--    INSERT + UPDATE.
-- ----------------------------------------------------------------------------
drop policy if exists "Editors can insert categories" on public.categories;
create policy "Editors can insert categories" on public.categories
  for insert to authenticated with check (public.is_active_editor());
drop policy if exists "Editors can update categories" on public.categories;
create policy "Editors can update categories" on public.categories
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Editors can insert series" on public.series;
create policy "Editors can insert series" on public.series
  for insert to authenticated with check (public.is_active_editor());
drop policy if exists "Editors can update series" on public.series;
create policy "Editors can update series" on public.series
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Editors can insert tags" on public.tags;
create policy "Editors can insert tags" on public.tags
  for insert to authenticated with check (public.is_active_editor());
drop policy if exists "Editors can update tags" on public.tags;
create policy "Editors can update tags" on public.tags
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

drop policy if exists "Editors can insert media" on public.media;
create policy "Editors can insert media" on public.media
  for insert to authenticated with check (public.is_active_editor());
drop policy if exists "Editors can update media" on public.media;
create policy "Editors can update media" on public.media
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 5. article_tags — bảng nối thuần, không có deleted_at -> gỡ tag khỏi bài
--    viết là DELETE thật (không phải soft-delete). Policy SELECT công khai
--    hiện có (theo bài viết published) không đủ cho editor xem tag của bài
--    draft/review/scheduled -> thêm SELECT toàn bộ cho editor.
-- ----------------------------------------------------------------------------
drop policy if exists "Editors can view all article_tags" on public.article_tags;
create policy "Editors can view all article_tags" on public.article_tags
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert article_tags" on public.article_tags;
create policy "Editors can insert article_tags" on public.article_tags
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can delete article_tags" on public.article_tags;
create policy "Editors can delete article_tags" on public.article_tags
  for delete to authenticated using (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- 6. Supabase Storage — bucket "media" cho ảnh upload từ Dashboard. Public
--    đọc được (ảnh hiển thị trên site công khai), chỉ editor active mới
--    upload/sửa/xoá được. Giới hạn mime-type + dung lượng cho production.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read media bucket" on storage.objects;
create policy "Public read media bucket" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "Editors can upload media bucket" on storage.objects;
create policy "Editors can upload media bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_active_editor());

drop policy if exists "Editors can update media bucket" on storage.objects;
create policy "Editors can update media bucket" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_active_editor());

drop policy if exists "Editors can delete media bucket" on storage.objects;
create policy "Editors can delete media bucket" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_active_editor());

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc, chỉ để kiểm tra):
--
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in
--     ('articles','authors','categories','series','tags','article_tags','media')
--   order by tablename, cmd;
--
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'media';
-- ============================================================================
