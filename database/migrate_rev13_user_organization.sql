-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 13: Dashboard V2.1 — User & Organization
-- System (RBAC, Organization, Audit Log).
--
-- Bối cảnh: Dashboard hiện chỉ có 1 khái niệm quyền duy nhất —
-- is_active_editor() (Rev 5): "có phải editor active hay không", nhị phân,
-- không phân biệt vai trò/module/hành động. Rev 13 bổ sung một lớp RBAC đầy
-- đủ (role + permission theo module x action, lưu trong database, không
-- hardcode) mà KHÔNG thay thế is_active_editor() — mọi bảng nội dung hiện có
-- (articles, authors, categories, series, tags, media, hero_slots, ads,
-- promotions, announcements, menus, footer, site_settings, magazine_issues...)
-- tiếp tục dùng đúng is_active_editor() như cũ, không sửa policy nào của các
-- bảng đó ở migration này — tránh rewrite RLS quy mô lớn nhiều rủi ro, và giữ
-- 100% khả năng tương thích ngược. RBAC mới chỉ gác các bảng MỚI của chính
-- module User & Organization (dashboard_users/roles/permissions/
-- role_permissions/departments/teams/positions/activity_log). Việc mở rộng
-- has_permission() ra các bảng nội dung hiện có được đề xuất là hạng mục
-- Dashboard V2.2 (xem báo cáo cuối).
--
-- Phân biệt QUAN TRỌNG — không được nhầm lẫn:
--   - public.authors.role  : nhãn hiển thị chức danh biên tập trên trang
--     công khai (vd "Tổng Biên tập") — nội dung, không phải access-control.
--     KHÔNG đụng tới ở migration này.
--   - public.profiles / membership_plans / memberships (Rev 3) : tài khoản
--     ĐỘC GIẢ công khai (membership), hoàn toàn tách biệt khỏi nhân sự vận
--     hành Dashboard. KHÔNG đụng tới ở migration này.
--   - public.dashboard_users (MỚI)  : tài khoản NHÂN SỰ vận hành Dashboard —
--     1-1 với auth.users (id trùng id), có thể (tuỳ chọn) liên kết tới đúng 1
--     dòng authors qua author_id khi người đó cũng có byline công khai.
--
-- Bootstrap liên tục vận hành: mọi authors đang active hiện tại (khớp email
-- với 1 tài khoản auth.users có sẵn — chính là điều kiện is_active_editor()
-- dùng) được seed sẵn 1 dòng dashboard_users với role "Super Admin", để không
-- ai đang có toàn quyền Dashboard bị mất quyền truy cập ngay sau khi chạy
-- migration này. Từ đó, phân quyền lại (nếu muốn) thực hiện qua giao diện
-- Roles/Users mới, không cần chạm CSDL lần nữa.
-- ============================================================================


-- ============================================================================
-- PHẦN 1 — Bảng tổ chức (Organization): departments / teams / positions
-- ============================================================================

create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  name          text not null,
  description   text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index if not exists departments_slug_key on public.departments (slug) where deleted_at is null;
create index if not exists departments_deleted_at_idx on public.departments (deleted_at);

create table if not exists public.teams (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid references public.departments (id) on delete set null,
  slug           text not null,
  name           text not null,
  description    text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create unique index if not exists teams_slug_key on public.teams (slug) where deleted_at is null;
create index if not exists teams_department_id_idx on public.teams (department_id);
create index if not exists teams_deleted_at_idx on public.teams (deleted_at);

create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  name          text not null,
  description   text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index if not exists positions_slug_key on public.positions (slug) where deleted_at is null;
create index if not exists positions_deleted_at_idx on public.positions (deleted_at);

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

drop trigger if exists trg_teams_updated_at on public.teams;
create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

drop trigger if exists trg_positions_updated_at on public.positions;
create trigger trg_positions_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();


-- ============================================================================
-- PHẦN 2 — RBAC: roles / permissions / role_permissions
-- ============================================================================

create table if not exists public.roles (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  name          text not null,
  description   text,
  is_system     boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint roles_key_format check (key ~ '^[a-z0-9_]{2,40}$')
);
create unique index if not exists roles_key_key on public.roles (key) where deleted_at is null;
create index if not exists roles_deleted_at_idx on public.roles (deleted_at);

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

-- permissions: catalog module x action — thuần dữ liệu tham chiếu, không có
-- vòng đời soft-delete riêng (mở rộng bằng cách insert thêm dòng mới, không
-- xoá dòng cũ đang được role_permissions tham chiếu).
create table if not exists public.permissions (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,
  action        text not null,
  key           text not null,
  description   text,
  created_at    timestamptz not null default now(),
  constraint permissions_key_format check (key ~ '^[a-z0-9_]+\.[a-z0-9_]+$')
);
create unique index if not exists permissions_key_key on public.permissions (key);
create index if not exists permissions_module_idx on public.permissions (module);

-- role_permissions: bảng nối thuần (giống article_tags) — sự tồn tại của 1
-- dòng = role đó ĐƯỢC cấp permission đó. Không có cột "granted" thừa.
create table if not exists public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_id  uuid not null references public.permissions (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_id)
);
create index if not exists role_permissions_permission_id_idx on public.role_permissions (permission_id);


-- ============================================================================
-- PHẦN 3 — dashboard_users: tài khoản nhân sự vận hành Dashboard
-- ============================================================================

create table if not exists public.dashboard_users (
  id             uuid primary key references auth.users (id) on delete cascade,
  author_id      uuid references public.authors (id) on delete set null,
  role_id        uuid references public.roles (id) on delete restrict,
  department_id  uuid references public.departments (id) on delete set null,
  team_id        uuid references public.teams (id) on delete set null,
  position_id    uuid references public.positions (id) on delete set null,
  username       text,
  display_name   text,
  avatar_url     text,
  email          text not null,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  provider       text not null default 'email',
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint dashboard_users_username_format check (
    username is null or username ~ '^[a-z0-9_.-]{3,40}$'
  )
);
create unique index if not exists dashboard_users_username_key on public.dashboard_users (username) where deleted_at is null and username is not null;
create unique index if not exists dashboard_users_email_key on public.dashboard_users (lower(email)) where deleted_at is null;
create index if not exists dashboard_users_role_id_idx on public.dashboard_users (role_id);
create index if not exists dashboard_users_status_idx on public.dashboard_users (status);
create index if not exists dashboard_users_deleted_at_idx on public.dashboard_users (deleted_at);

drop trigger if exists trg_dashboard_users_updated_at on public.dashboard_users;
create trigger trg_dashboard_users_updated_at
  before update on public.dashboard_users
  for each row execute function public.set_updated_at();


-- ============================================================================
-- PHẦN 4 — activity_log: nhật ký hoạt động, append-only
-- ============================================================================

create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.dashboard_users (id) on delete set null,
  actor_email   text,
  action        text not null,
  target_type   text,
  target_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists activity_log_actor_id_idx on public.activity_log (actor_id);
create index if not exists activity_log_action_idx on public.activity_log (action);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);


-- ============================================================================
-- PHẦN 5 — Hàm phân quyền
-- ============================================================================

-- Rev 5 is_active_editor() thắt chặt thêm: trước đây chỉ kiểm tra
-- deleted_at is null, CHƯA kiểm tra is_active — 1 author bị đánh dấu
-- is_active = false (nhưng chưa soft-delete) trước đây vẫn được xem là
-- editor active, nay bị chặn đúng như is_active thể hiện. Đây là thay đổi
-- SIẾT CHẶT HƠN (chỉ có thể làm mất quyền của tài khoản đã bị đánh dấu
-- is_active=false — vốn dĩ không nên còn quyền), không có tài khoản nào
-- đang hoạt động hợp lệ bị ảnh hưởng vì is_active mặc định true.
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
      and a.is_active = true
  );
$$;

create or replace function public.is_active_dashboard_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.dashboard_users du
    where du.id = auth.uid()
      and du.deleted_at is null
      and du.status = 'active'
  );
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.dashboard_users du
    join public.role_permissions rp on rp.role_id = du.role_id
    join public.permissions p on p.id = rp.permission_id
    where du.id = auth.uid()
      and du.deleted_at is null
      and du.status = 'active'
      and p.key = permission_key
  );
$$;

-- Chặn tự leo thang quyền (privilege escalation): khi 1 user tự sửa đúng
-- dòng dashboard_users của chính mình (auth.uid() = old.id) mà KHÔNG có
-- permission "users.manage", các trường nhạy cảm bị ép giữ nguyên giá trị
-- cũ bất kể client gửi gì lên — chỉ còn sửa được username/display_name/
-- avatar_url (dùng cho trang Profile tự phục vụ ở Phần 6).
create or replace function public.dashboard_users_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.has_permission('users.manage') then
    new.role_id := old.role_id;
    new.status := old.status;
    new.department_id := old.department_id;
    new.team_id := old.team_id;
    new.position_id := old.position_id;
    new.author_id := old.author_id;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dashboard_users_guard_self_update on public.dashboard_users;
create trigger trg_dashboard_users_guard_self_update
  before update on public.dashboard_users
  for each row execute function public.dashboard_users_guard_self_update();


-- ============================================================================
-- PHẦN 6 — Row Level Security
-- ============================================================================

alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.positions enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.dashboard_users enable row level security;
alter table public.activity_log enable row level security;

-- departments/teams/positions: đọc cho mọi dashboard user active, ghi cho ai
-- có quyền organization.manage.
drop policy if exists "Dashboard users can view departments" on public.departments;
create policy "Dashboard users can view departments" on public.departments
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "organization.manage can write departments" on public.departments;
create policy "organization.manage can write departments" on public.departments
  for insert to authenticated with check (public.has_permission('organization.manage'));
drop policy if exists "organization.manage can update departments" on public.departments;
create policy "organization.manage can update departments" on public.departments
  for update to authenticated using (public.has_permission('organization.manage')) with check (public.has_permission('organization.manage'));

drop policy if exists "Dashboard users can view teams" on public.teams;
create policy "Dashboard users can view teams" on public.teams
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "organization.manage can write teams" on public.teams;
create policy "organization.manage can write teams" on public.teams
  for insert to authenticated with check (public.has_permission('organization.manage'));
drop policy if exists "organization.manage can update teams" on public.teams;
create policy "organization.manage can update teams" on public.teams
  for update to authenticated using (public.has_permission('organization.manage')) with check (public.has_permission('organization.manage'));

drop policy if exists "Dashboard users can view positions" on public.positions;
create policy "Dashboard users can view positions" on public.positions
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "organization.manage can write positions" on public.positions;
create policy "organization.manage can write positions" on public.positions
  for insert to authenticated with check (public.has_permission('organization.manage'));
drop policy if exists "organization.manage can update positions" on public.positions;
create policy "organization.manage can update positions" on public.positions
  for update to authenticated using (public.has_permission('organization.manage')) with check (public.has_permission('organization.manage'));

-- roles/permissions/role_permissions: đọc cho mọi dashboard user active
-- (Users Manager cần load danh sách role để gán; Profile cần đọc role của
-- chính mình), ghi cho ai có quyền roles.manage.
drop policy if exists "Dashboard users can view roles" on public.roles;
create policy "Dashboard users can view roles" on public.roles
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "roles.manage can write roles" on public.roles;
create policy "roles.manage can write roles" on public.roles
  for insert to authenticated with check (public.has_permission('roles.manage') and not is_system);
drop policy if exists "roles.manage can update roles" on public.roles;
create policy "roles.manage can update roles" on public.roles
  for update to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

drop policy if exists "Dashboard users can view permissions" on public.permissions;
create policy "Dashboard users can view permissions" on public.permissions
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "permissions.manage can write permissions" on public.permissions;
create policy "permissions.manage can write permissions" on public.permissions
  for insert to authenticated with check (public.has_permission('permissions.manage'));
drop policy if exists "permissions.manage can update permissions" on public.permissions;
create policy "permissions.manage can update permissions" on public.permissions
  for update to authenticated using (public.has_permission('permissions.manage')) with check (public.has_permission('permissions.manage'));

drop policy if exists "Dashboard users can view role_permissions" on public.role_permissions;
create policy "Dashboard users can view role_permissions" on public.role_permissions
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "roles.manage can insert role_permissions" on public.role_permissions;
create policy "roles.manage can insert role_permissions" on public.role_permissions
  for insert to authenticated with check (public.has_permission('roles.manage'));
drop policy if exists "roles.manage can delete role_permissions" on public.role_permissions;
create policy "roles.manage can delete role_permissions" on public.role_permissions
  for delete to authenticated using (public.has_permission('roles.manage'));

-- dashboard_users: tự xem/tự sửa hồ sơ của chính mình luôn được phép (giới
-- hạn field nhạy cảm đã bị trigger ở Phần 5 chặn); users.view/users.edit cho
-- phép thao tác trên MỌI dòng; không có policy DELETE thật (xoá = soft
-- delete qua UPDATE, đúng quy ước chung toàn hệ thống).
drop policy if exists "Users can view own profile" on public.dashboard_users;
create policy "Users can view own profile" on public.dashboard_users
  for select to authenticated using (id = auth.uid());
drop policy if exists "users.view can view all dashboard_users" on public.dashboard_users;
create policy "users.view can view all dashboard_users" on public.dashboard_users
  for select to authenticated using (public.has_permission('users.view'));
drop policy if exists "users.create can insert dashboard_users" on public.dashboard_users;
create policy "users.create can insert dashboard_users" on public.dashboard_users
  for insert to authenticated with check (public.has_permission('users.create'));
drop policy if exists "Users can update own profile" on public.dashboard_users;
create policy "Users can update own profile" on public.dashboard_users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "users.edit can update any dashboard_users" on public.dashboard_users;
create policy "users.edit can update any dashboard_users" on public.dashboard_users
  for update to authenticated using (public.has_permission('users.edit')) with check (public.has_permission('users.edit'));

-- activity_log: append-only — chỉ INSERT (actor tự ghi log của chính mình,
-- hoặc service_role ghi thay khi actor_id không xác định được phía client)
-- và SELECT (users.view/system.view xem toàn bộ, còn lại chỉ xem log của
-- chính mình — phục vụ "lịch sử đăng nhập" ở Phần 6 Profile). Không có
-- policy UPDATE/DELETE — nhật ký không được sửa/xoá qua Dashboard.
drop policy if exists "Dashboard users can insert own activity_log" on public.activity_log;
create policy "Dashboard users can insert own activity_log" on public.activity_log
  for insert to authenticated with check (actor_id = auth.uid());
drop policy if exists "Users can view own activity_log" on public.activity_log;
create policy "Users can view own activity_log" on public.activity_log
  for select to authenticated using (actor_id = auth.uid());
drop policy if exists "system.view can view all activity_log" on public.activity_log;
create policy "system.view can view all activity_log" on public.activity_log
  for select to authenticated using (public.has_permission('system.view'));


-- ============================================================================
-- PHẦN 7 — Seed: permission catalog (module x action)
-- ============================================================================

insert into public.permissions (module, action, key, description)
values
  ('articles', 'view', 'articles.view', 'Xem bài viết (mọi trạng thái)'),
  ('articles', 'create', 'articles.create', 'Tạo bài viết mới'),
  ('articles', 'edit', 'articles.edit', 'Sửa bài viết'),
  ('articles', 'delete', 'articles.delete', 'Xoá (soft delete) bài viết'),
  ('articles', 'publish', 'articles.publish', 'Xuất bản bài viết'),
  ('articles', 'approve', 'articles.approve', 'Duyệt bài viết trước khi xuất bản'),

  ('magazine', 'view', 'magazine.view', 'Xem số tạp chí'),
  ('magazine', 'create', 'magazine.create', 'Tạo số tạp chí mới'),
  ('magazine', 'edit', 'magazine.edit', 'Sửa số tạp chí'),
  ('magazine', 'delete', 'magazine.delete', 'Xoá (soft delete) số tạp chí'),
  ('magazine', 'publish', 'magazine.publish', 'Xuất bản số tạp chí'),

  ('media', 'view', 'media.view', 'Xem thư viện media'),
  ('media', 'create', 'media.create', 'Tải lên media mới'),
  ('media', 'edit', 'media.edit', 'Sửa metadata media'),
  ('media', 'delete', 'media.delete', 'Xoá (soft delete) media'),

  ('categories', 'view', 'categories.view', 'Xem chuyên mục'),
  ('categories', 'create', 'categories.create', 'Tạo chuyên mục mới'),
  ('categories', 'edit', 'categories.edit', 'Sửa chuyên mục'),
  ('categories', 'delete', 'categories.delete', 'Xoá (soft delete) chuyên mục'),

  ('series', 'view', 'series.view', 'Xem series'),
  ('series', 'create', 'series.create', 'Tạo series mới'),
  ('series', 'edit', 'series.edit', 'Sửa series'),
  ('series', 'delete', 'series.delete', 'Xoá (soft delete) series'),

  ('authors', 'view', 'authors.view', 'Xem hồ sơ tác giả'),
  ('authors', 'create', 'authors.create', 'Tạo hồ sơ tác giả mới'),
  ('authors', 'edit', 'authors.edit', 'Sửa hồ sơ tác giả'),
  ('authors', 'delete', 'authors.delete', 'Xoá (soft delete) hồ sơ tác giả'),

  ('advertisements', 'view', 'advertisements.view', 'Xem quảng cáo'),
  ('advertisements', 'create', 'advertisements.create', 'Tạo quảng cáo mới'),
  ('advertisements', 'edit', 'advertisements.edit', 'Sửa quảng cáo'),
  ('advertisements', 'delete', 'advertisements.delete', 'Xoá (soft delete) quảng cáo'),

  ('promotions', 'view', 'promotions.view', 'Xem promotion'),
  ('promotions', 'create', 'promotions.create', 'Tạo promotion mới'),
  ('promotions', 'edit', 'promotions.edit', 'Sửa promotion'),
  ('promotions', 'delete', 'promotions.delete', 'Xoá (soft delete) promotion'),

  ('announcements', 'view', 'announcements.view', 'Xem thông báo'),
  ('announcements', 'create', 'announcements.create', 'Tạo thông báo mới'),
  ('announcements', 'edit', 'announcements.edit', 'Sửa thông báo'),
  ('announcements', 'delete', 'announcements.delete', 'Xoá (soft delete) thông báo'),

  ('settings', 'view', 'settings.view', 'Xem Site Settings/Menu/Footer'),
  ('settings', 'edit', 'settings.edit', 'Sửa Site Settings/Menu/Footer'),
  ('settings', 'manage', 'settings.manage', 'Toàn quyền cấu hình hệ thống'),

  ('dashboard', 'view', 'dashboard.view', 'Truy cập Dashboard'),

  ('analytics', 'view', 'analytics.view', 'Xem thống kê/analytics'),

  ('users', 'view', 'users.view', 'Xem danh sách người dùng Dashboard'),
  ('users', 'create', 'users.create', 'Tạo người dùng Dashboard mới'),
  ('users', 'edit', 'users.edit', 'Sửa người dùng Dashboard (bao gồm người khác)'),
  ('users', 'delete', 'users.delete', 'Xoá (soft delete)/khôi phục người dùng Dashboard'),
  ('users', 'manage', 'users.manage', 'Đổi role/status/tổ chức của người dùng (kể cả chính mình)'),

  ('roles', 'view', 'roles.view', 'Xem danh sách role'),
  ('roles', 'manage', 'roles.manage', 'Tạo/sửa role và gán permission cho role'),

  ('permissions', 'view', 'permissions.view', 'Xem danh mục permission'),
  ('permissions', 'manage', 'permissions.manage', 'Mở rộng danh mục permission'),

  ('organization', 'view', 'organization.view', 'Xem Department/Team/Position'),
  ('organization', 'manage', 'organization.manage', 'Quản lý Department/Team/Position'),

  ('system', 'view', 'system.view', 'Xem Audit Log toàn hệ thống'),
  ('system', 'manage', 'system.manage', 'Quản trị hệ thống cấp cao')
on conflict (key) do nothing;


-- ============================================================================
-- PHẦN 8 — Seed: 8 role mặc định
-- ============================================================================

-- roles_key_key là unique index PARTIAL (where deleted_at is null) — Postgres
-- không cho phép ON CONFLICT trực tiếp trên unique index có mệnh đề WHERE
-- kèm theo cột không nằm trong index, nên dùng insert...select...where not
-- exists để bảo đảm idempotent (an toàn chạy lại nhiều lần).
insert into public.roles (key, name, description, is_system, sort_order)
select v.key, v.name, v.description, true, v.sort_order
from (values
  ('super_admin', 'Super Admin', 'Toàn quyền trên mọi module — dành cho quản trị hệ thống cấp cao nhất.', 0),
  ('administrator', 'Administrator', 'Toàn quyền vận hành nội dung và người dùng, trừ mở rộng danh mục permission.', 1),
  ('managing_editor', 'Managing Editor', 'Toàn quyền biên tập nội dung (kể cả duyệt/xuất bản), không quản lý người dùng/role.', 2),
  ('editor', 'Editor', 'Tạo/sửa/xuất bản nội dung, không xoá và không duyệt bài của người khác.', 3),
  ('author', 'Author', 'Tạo/sửa nội dung, không xuất bản/không xoá.', 4),
  ('reviewer', 'Reviewer', 'Xem và duyệt nội dung, không tự tạo/sửa.', 5),
  ('contributor', 'Contributor', 'Tạo bản nháp nội dung, không sửa/xuất bản.', 6),
  ('guest', 'Guest', 'Chỉ xem, không thao tác.', 7)
) as v(key, name, description, sort_order)
where not exists (
  select 1 from public.roles r where r.key = v.key and r.deleted_at is null
);


-- ============================================================================
-- PHẦN 9 — Seed: role_permissions mặc định
-- ============================================================================

-- Super Admin: mọi permission hiện có trong catalog.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Administrator: mọi permission trừ permissions.manage (không được tự ý mở
-- rộng danh mục permission gốc).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'administrator'
  and p.key <> 'permissions.manage'
on conflict do nothing;

-- Managing Editor: toàn quyền nội dung (view/create/edit/delete/publish/
-- approve) + dashboard/analytics/settings.view/users.view, không role/
-- permissions/system/organization.manage.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'managing_editor'
  and (
    p.module in ('articles', 'magazine', 'media', 'categories', 'series', 'authors',
                 'advertisements', 'promotions', 'announcements')
    or p.key in ('dashboard.view', 'analytics.view', 'settings.view', 'users.view', 'organization.view')
  )
on conflict do nothing;

-- Editor: view/create/edit/publish nội dung (không delete/approve).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'editor'
  and (
    (p.module in ('articles', 'magazine', 'media', 'categories', 'series', 'authors',
                  'advertisements', 'promotions', 'announcements')
     and p.action in ('view', 'create', 'edit', 'publish'))
    or p.key in ('dashboard.view', 'analytics.view')
  )
on conflict do nothing;

-- Author: view/create/edit nội dung liên quan tới bài viết/tạp chí/media
-- (không publish/delete).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'author'
  and (
    (p.module in ('articles', 'magazine', 'media') and p.action in ('view', 'create', 'edit'))
    or p.key = 'dashboard.view'
  )
on conflict do nothing;

-- Reviewer: xem toàn bộ nội dung + duyệt articles/magazine.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'reviewer'
  and (
    (p.module in ('articles', 'magazine', 'media', 'categories', 'series', 'authors',
                  'advertisements', 'promotions', 'announcements') and p.action = 'view')
    or p.key in ('articles.approve', 'magazine.publish', 'dashboard.view')
  )
on conflict do nothing;

-- Contributor: view + create articles/magazine, view media.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'contributor'
  and (
    p.key in ('articles.view', 'articles.create', 'magazine.view', 'magazine.create', 'media.view', 'dashboard.view')
  )
on conflict do nothing;

-- Guest: chỉ xem dashboard + nội dung công khai cơ bản.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'guest'
  and p.key in ('dashboard.view', 'articles.view', 'magazine.view')
on conflict do nothing;


-- ============================================================================
-- PHẦN 10 — Bootstrap: seed dashboard_users cho mọi author active hiện có
-- (đúng tập hợp mà is_active_editor() đang công nhận), gán role Super Admin
-- để không ai mất quyền truy cập ngay sau khi chạy migration.
-- ============================================================================

insert into public.dashboard_users (id, author_id, role_id, username, display_name, avatar_url, email, status, provider, last_login_at)
select
  u.id,
  a.id,
  (select id from public.roles where key = 'super_admin' and deleted_at is null),
  a.slug,
  a.name,
  a.avatar_url,
  u.email,
  case when a.is_active then 'active' else 'inactive' end,
  coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
  u.last_sign_in_at
from auth.users u
join public.authors a on lower(a.email) = lower(u.email)
where a.deleted_at is null
on conflict (id) do nothing;

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--
--   select du.email, r.name as role, du.status
--   from public.dashboard_users du
--   left join public.roles r on r.id = du.role_id
--   order by du.created_at;
--
--   select module, count(*) from public.permissions group by module order by module;
--
--   select r.name, count(*) from public.roles r
--   join public.role_permissions rp on rp.role_id = r.id
--   group by r.name order by r.name;
-- ============================================================================
