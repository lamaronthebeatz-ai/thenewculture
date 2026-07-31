-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 16: Author Medals / Huân chương tác giả.
--
-- Tách 2 bảng: "medals" (master — 1 huân chương, định nghĩa 1 lần) và
-- "author_medals" (assignment — gán 1 medal cho 1 author, không nhân đôi dữ
-- liệu medal). Sửa master (tên/mô tả/ảnh) áp dụng ngay cho MỌI author đang
-- được gán medal đó, vì author_medals chỉ lưu tham chiếu medal_id, không lưu
-- lại bất kỳ trường nào của medal.
--
-- Quản lý hoàn toàn bên trong module Authors hiện có của Dashboard (không có
-- module sidebar riêng) — RLS vì vậy soi theo đúng permission 'authors.edit'
-- cho phần assignment (gán/gỡ/sắp xếp trên 1 author cụ thể, thao tác từ
-- AuthorForm), và permission module 'medals' riêng cho phần master (tạo/sửa
-- 1 định nghĩa medal dùng chung — tác động rộng hơn 1 author).
--
-- Ảnh medal tái dùng nguyên bảng/bucket "media" (Media Library, Rev 1/5) qua
-- cột medals.media_id — không tạo hệ thống upload riêng, không tạo cột lưu
-- URL trùng lặp. GIF giữ nguyên hoạt ảnh khi render công khai vì build.py chỉ
-- in thẳng <img src="{media.url}"> (không convert/resize) — xem build.py.
--
-- Idempotent: mọi CREATE/ALTER dùng "if not exists", mọi INSERT permission
-- dùng "on conflict do nothing", mọi CREATE POLICY/TRIGGER dùng "drop ... if
-- exists" trước. Không đổi bất kỳ cột/bảng authors hiện có, không đổi
-- URL/route trang tác giả hiện có.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PHẦN 1 — Bảng medals (master).
-- ----------------------------------------------------------------------------

create table if not exists public.medals (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  short_description     text,
  detailed_description  text,
  media_id              uuid references public.media (id) on delete set null,
  alt_text              text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  constraint medals_name_not_blank check (btrim(name) <> '')
);

create index if not exists medals_deleted_at_idx on public.medals (deleted_at);
create index if not exists medals_is_active_idx on public.medals (is_active);
create index if not exists medals_media_id_idx on public.medals (media_id);

drop trigger if exists trg_medals_updated_at on public.medals;
create trigger trg_medals_updated_at
  before update on public.medals
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- PHẦN 2 — Bảng author_medals (assignment: author <-> medal).
-- Không lưu name/description/media của medal ở đây — chỉ tham chiếu medal_id,
-- để sửa master là tự động cập nhật cho mọi author đang gán (không duplicate).
-- ----------------------------------------------------------------------------

create table if not exists public.author_medals (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.authors (id) on delete cascade,
  medal_id      uuid not null references public.medals (id) on delete cascade,
  awarded_at    timestamptz,
  sort_order    integer not null default 0,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint author_medals_unique_pair unique (author_id, medal_id)
);

create index if not exists author_medals_author_id_idx on public.author_medals (author_id, sort_order);
create index if not exists author_medals_medal_id_idx on public.author_medals (medal_id);

drop trigger if exists trg_author_medals_updated_at on public.author_medals;
create trigger trg_author_medals_updated_at
  before update on public.author_medals
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- PHẦN 3 — Permission catalog: module "medals" (master medal), 4 action
-- chuẩn giống authors/tags/hero (Rev 13/14).
-- ----------------------------------------------------------------------------

insert into public.permissions (module, action, key, description)
values
  ('medals', 'view', 'medals.view', 'Xem huân chương (master)'),
  ('medals', 'create', 'medals.create', 'Tạo huân chương mới'),
  ('medals', 'edit', 'medals.edit', 'Sửa huân chương (áp dụng cho mọi author đang gán)'),
  ('medals', 'delete', 'medals.delete', 'Xoá (soft delete) huân chương')
on conflict (key) do nothing;

-- role_permissions là bảng nạp sẵn — permission mới không tự có ở
-- super_admin/administrator, phải cấp lại tường minh (xem rev14 cùng lý do).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'administrator' and p.key <> 'permissions.manage'
on conflict do nothing;

-- Cấp cho đúng những role hiện đang quản lý module "authors" (Rev 13),
-- cùng phạm vi action — managing_editor: đầy đủ; editor: view/create/edit
-- (không delete); reviewer: chỉ xem.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'managing_editor' and p.module = 'medals'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'editor' and p.module = 'medals' and p.action in ('view', 'create', 'edit')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'reviewer' and p.module = 'medals' and p.action = 'view'
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 4 — RLS.
-- ----------------------------------------------------------------------------

alter table public.medals        enable row level security;
alter table public.author_medals enable row level security;

-- Public (anon, build.py dùng SUPABASE_ANON_KEY) — chỉ đọc medal đang active
-- + chưa xoá, và chỉ đọc assignment is_visible=true của author đang public
-- (is_active=true, chưa xoá) — cùng nguyên tắc "Public read active authors".
drop policy if exists "Public read active medals" on public.medals;
create policy "Public read active medals" on public.medals
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Public read visible author_medals" on public.author_medals;
create policy "Public read visible author_medals" on public.author_medals
  for select using (
    is_visible = true
    and exists (
      select 1 from public.authors a
      where a.id = author_medals.author_id
        and a.deleted_at is null
        and a.is_active = true
    )
  );

-- Dashboard (authenticated) — medals: soi permission module 'medals'.
drop policy if exists "Editors can view all medals" on public.medals;
create policy "Editors can view all medals" on public.medals
  for select to authenticated using (public.is_active_editor() and public.has_permission('medals.view'));
drop policy if exists "Editors can insert medals" on public.medals;
create policy "Editors can insert medals" on public.medals
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('medals.create'));
drop policy if exists "Editors can update medals" on public.medals;
create policy "Editors can update medals" on public.medals
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('medals.edit') or public.has_permission('medals.delete')))
  with check (public.is_active_editor() and (public.has_permission('medals.edit') or public.has_permission('medals.delete')));

-- Dashboard (authenticated) — author_medals: đây là thao tác "sửa 1 author cụ
-- thể" (gán/gỡ/sắp xếp huân chương của họ) nên soi permission 'authors.view'/
-- 'authors.edit' — đúng permission đã gác AuthorForm/AuthorsList hiện có,
-- không cần permission riêng thứ 2 cho việc này.
drop policy if exists "Editors can view all author_medals" on public.author_medals;
create policy "Editors can view all author_medals" on public.author_medals
  for select to authenticated using (public.is_active_editor() and public.has_permission('authors.view'));
drop policy if exists "Editors can insert author_medals" on public.author_medals;
create policy "Editors can insert author_medals" on public.author_medals
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('authors.edit'));
drop policy if exists "Editors can update author_medals" on public.author_medals;
create policy "Editors can update author_medals" on public.author_medals
  for update to authenticated
  using (public.is_active_editor() and public.has_permission('authors.edit'))
  with check (public.is_active_editor() and public.has_permission('authors.edit'));
drop policy if exists "Editors can delete author_medals" on public.author_medals;
create policy "Editors can delete author_medals" on public.author_medals
  for delete to authenticated using (public.is_active_editor() and public.has_permission('authors.edit'));

-- ============================================================================
-- HẾT Rev 16.
-- ============================================================================
