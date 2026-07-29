-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 9: Announcement Manager (CMS V2 Phase 4
-- — Module 5, theo đúng Architecture Report đã duyệt. Module độc lập —
-- không đụng Layout Builder, Theme, Hero, hay bất kỳ bảng nào khác.)
--
-- Đây là năng lực HOÀN TOÀN MỚI (không tìm thấy hàm/khái niệm ticker/
-- breaking/announcement/countdown nào trong build.py trước Rev 9, đã xác
-- nhận ở audit) — không có dữ liệu cũ cần fallback, bảng rỗng sau khi
-- chạy migration là trạng thái đúng và an toàn.
--
-- Xoá: Soft Delete (deleted_at), đúng quy ước thống nhất từ Phase 2.
-- File này KHÔNG sửa database/schema.sql, KHÔNG đổi bất kỳ bảng/API cũ nào.
-- ============================================================================

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'bar_top'
                check (kind in ('bar_top', 'bar_bottom', 'scrolling_text', 'breaking_news', 'ticker', 'countdown')),
  message       text not null,
  link_url      text,
  countdown_at  timestamptz,          -- chỉ có ý nghĩa khi kind='countdown'
  style         text not null default 'info' check (style in ('info', 'warning', 'critical', 'brand')),
  priority      integer not null default 0,
  start_at      timestamptz,
  end_at        timestamptz,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists announcements_active_idx
  on public.announcements (is_active, priority) where deleted_at is null;

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — đúng mẫu is_active_editor() đã kiểm chứng từ Rev 5/6/7/8
-- ----------------------------------------------------------------------------
alter table public.announcements enable row level security;

drop policy if exists "Public read announcements" on public.announcements;
create policy "Public read announcements" on public.announcements
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Editors can view all announcements" on public.announcements;
create policy "Editors can view all announcements" on public.announcements
  for select to authenticated using (public.is_active_editor());

drop policy if exists "Editors can insert announcements" on public.announcements;
create policy "Editors can insert announcements" on public.announcements
  for insert to authenticated with check (public.is_active_editor());

drop policy if exists "Editors can update announcements" on public.announcements;
create policy "Editors can update announcements" on public.announcements
  for update to authenticated using (public.is_active_editor()) with check (public.is_active_editor());

-- ============================================================================
-- KHÔNG seed dữ liệu — bảng rỗng sau migration là đúng, build.py không
-- render gì cả cho tới khi editor tạo announcement active đầu tiên qua
-- Dashboard (đúng nguyên tắc fail-safe: chưa migrate/bảng rỗng/lỗi query
-- đều dẫn tới cùng 1 kết quả — không render gì, website y hệt hiện tại).
--
-- Xác nhận sau khi chạy (không bắt buộc):
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='announcements' order by cmd;
-- ============================================================================
