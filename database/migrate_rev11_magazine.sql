-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 11: TNC Magazine (Sveltia -> Dashboard)
--
-- Audit trước khi thiết kế (xác nhận trực tiếp trong code, không suy đoán):
--   - Sveltia collection "magazine" (admin/config.yml) chỉ có đúng 6 field:
--     cover_image (ảnh), cover_story (relation -> articles, lưu SLUG thô),
--     editors_note (text), month (1-12), year (số), status (draft/published).
--     KHÔNG có field slug tự nhập (slug = "{year}-{month}", Sveltia tự sinh
--     làm tên file), KHÔNG có Volume, KHÔNG có Featured Issue (issue mới nhất
--     luôn tự động là issue nổi bật — magazine.latest_issue(), không có cờ
--     ghi đè thủ công), KHÔNG có field SEO riêng (title/description trang
--     Issue tự sinh từ number_display + editors_note, xem
--     render_magazine_issue_page() dòng ~4791-4793 build.py).
--   - Issue Number KHÔNG lưu ở đâu cả — magazine.build_issues() tính lại mỗi
--     lần build (thứ tự (year, month) tăng dần trong các issue published).
--   - build.py hiện đọc trực tiếp content/magazine/*.md (load_magazine_issues_raw(),
--     dùng chung _parse_frontmatter đã có) — ĐÂY LÀ COLLECTION DUY NHẤT CÒN
--     LẠI đọc từ file, mọi collection khác đã ở Supabase từ trước.
--   - Dữ liệu thật hiện có: đúng 1 file content/magazine/2026-7.md (seed y
--     nguyên bên dưới để build.py đọc Supabase cho ra output giống hệt).
--
-- Migration CHỈ chuyển nơi lưu trữ + thêm Soft Delete (đúng quy ước thống
-- nhất toàn hệ thống) — không thêm field mới ngoài field hạ tầng chuẩn
-- (id/created_at/updated_at/deleted_at) đã dùng cho mọi bảng Rev 6-10.
-- cover_story lưu dạng TEXT (không phải khoá ngoại tới articles.id) để giữ
-- đúng hành vi hiện có: _resolve_magazine_article() tự chuẩn hoá qua
-- slugify() rồi mới tra cứu — slug thô có thể còn dấu (Sveltia không ép
-- clean_accents cho slug Article) nên không thể ràng buộc FK cứng mà không
-- đổi hành vi khi slug "bẩn".
--
-- File này KHÔNG sửa database/schema.sql hay bất kỳ migrate_rev5-10 nào.
-- ============================================================================

create table if not exists public.magazine_issues (
  id               uuid primary key default gen_random_uuid(),
  -- Tương đương "{year}-{month}" mà Sveltia dùng làm tên file/identifier —
  -- không phải URL public (URL thật là magazine-issue-<number_display>.html,
  -- tính từ Issue Number, không đổi). Giữ lại để hiển thị/tham chiếu trong
  -- Dashboard đúng như editor đã quen thấy ở Sveltia.
  slug             text not null,
  cover_image_url  text,
  cover_story_slug text,
  editors_note     text,
  month            integer not null check (month between 1 and 12),
  year             integer not null check (year between 2000 and 2100),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists magazine_issues_published_idx
  on public.magazine_issues (year, month) where deleted_at is null and status = 'published';

drop trigger if exists trg_magazine_issues_updated_at on public.magazine_issues;
create trigger trg_magazine_issues_updated_at
  before update on public.magazine_issues
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — đúng mẫu is_active_editor() đã kiểm chứng từ Rev 5-10. Public chỉ
-- đọc issue published + chưa xoá mềm (build.py tự lọc thêm draft/xoá ở
-- code hiện có, nhưng chặn cả ở RLS cho nhất quán với mọi bảng khác).
-- ----------------------------------------------------------------------------
alter table public.magazine_issues enable row level security;

drop policy if exists "Public read published magazine issues" on public.magazine_issues;
create policy "Public read published magazine issues" on public.magazine_issues
  for select using (deleted_at is null and status = 'published');

drop policy if exists "Editors can view all magazine issues" on public.magazine_issues;
create policy "Editors can view all magazine issues" on public.magazine_issues
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert magazine issues" on public.magazine_issues;
create policy "Editors can insert magazine issues" on public.magazine_issues
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update magazine issues" on public.magazine_issues;
create policy "Editors can update magazine issues" on public.magazine_issues
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ----------------------------------------------------------------------------
-- Seed: đúng 1 số báo thật đang chạy production (content/magazine/2026-7.md)
-- — để build.py đọc Supabase cho ra output giống hệt ngay sau khi migrate,
-- không có khoảng trống hiển thị nào (đúng tinh thần Rev 7's site_settings/
-- footer_settings seed thật).
-- ----------------------------------------------------------------------------
insert into public.magazine_issues (slug, cover_image_url, cover_story_slug, editors_note, month, year, status)
select '2026-7', '/uploads/3894.png',
       'kosmik-2026-khi-spacespeakers-đưa-sân-khấu-của-mình-đến-las-vegas',
       '', 7, 2026, 'published'
where not exists (
  select 1 from public.magazine_issues where year = 2026 and month = 7 and deleted_at is null
);

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--   select slug, year, month, status from public.magazine_issues order by year, month;
--   select policyname, cmd from pg_policies where schemaname='public'
--     and tablename='magazine_issues' order by cmd;
-- ============================================================================
