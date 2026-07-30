-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 15: Dashboard v2.2 — RBAC + Ownership
-- Authorization System (canonical spec).
--
-- Mô hình: KHÔNG phải RBAC thuần. Một hành động được phép khi:
--   (Role có Permission) AND (Ownership Condition đúng theo Scope của
--   permission đó cho role đang dùng, HOẶC scope = 'all' — tương đương
--   "bypass ownership").
--
-- Đây LÀ bước mở rộng của Rev 14 (không thay thế) — has_permission() (Rev
-- 13/14) tiếp tục là điều kiện GATE nhị phân "role này có permission này
-- không" cho mọi bảng, không đổi. Rev 15 thêm 1 lớp SCOPE phía trên
-- has_permission(), áp dụng CHỈ cho bảng articles (bảng "Content" duy nhất
-- hiện có đầy đủ ý nghĩa ownership/workflow biên tập theo đúng ví dụ trong
-- spec — magazine_issues/media/hero/ads/... không có khái niệm tác giả cá
-- nhân nên giữ nguyên gate nhị phân của Rev 14, không đổi). Mở rộng sang
-- module khác sau này chỉ cần: thêm cột ownership chuẩn (owner_id/
-- assigned_editor/reviewer/publisher/department/team) + 1 dòng
-- ownership_policy + viết lại policy RLS bằng has_permission_scoped() y hệt
-- mẫu ở đây — không cần sửa engine (check_ownership_scope không hardcode
-- theo tên bảng, chỉ đọc field chuẩn từ jsonb).
--
-- Multi-role: dashboard_users.role_id (Rev 13) tiếp tục là "vai trò chính"
-- (hiển thị gọn trong danh sách Users, mặc định khi tạo user mới) — KHÔNG
-- xoá cột này (tương thích ngược). user_roles (MỚI) là nguồn THẬT SỰ cho
-- has_permission()/has_permission_scoped() — 1 user có thể có nhiều role
-- cùng lúc. Trigger đồng bộ 1 chiều: đổi role_id chính -> tự thêm vào
-- user_roles (không tự xoá role khác đã gán thêm).
--
-- An toàn ngược khi triển khai: scope 'department'/'team' coi cột ownership
-- đang NULL trên 1 dòng articles là "chưa gán, mở cho mọi người trong
-- scope tương ứng thao tác" (không phải "không ai được") — vì TOÀN BỘ
-- article hiện có sẽ có department/team = NULL ngay sau migration (chưa ai
-- gán) và Editor role production hiện tại đang thao tác bình thường trên
-- mọi bài — nếu scope 'department' chặn tuyệt đối khi NULL, mọi Editor sẽ
-- mất quyền sửa NGAY LẬP TỨC sau khi chạy migration này (phá vỡ production
-- production, vi phạm yêu cầu backward compatible). scope 'own'/'assigned'
-- KHÔNG có ngoại lệ này (owner_id luôn được set = author_id qua trigger,
-- không bao giờ NULL trong thực tế, nên không cần khoan dung).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PHẦN 1 — user_roles: multi-role thật sự.
-- ----------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id     uuid not null references public.dashboard_users (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);

-- Seed từ role_id hiện có của mọi dashboard_users (không ai mất quyền).
insert into public.user_roles (user_id, role_id)
select id, role_id from public.dashboard_users where role_id is not null
on conflict do nothing;

-- Đổi role chính (role_id) qua UserForm hiện có -> tự thêm vào user_roles,
-- không cần sửa UI ngay để có multi-role hoạt động đúng ngay lập tức.
create or replace function public.sync_user_roles_from_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_id is not null then
    insert into public.user_roles (user_id, role_id) values (new.id, new.role_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dashboard_users_sync_user_roles on public.dashboard_users;
create trigger trg_dashboard_users_sync_user_roles
  after insert or update of role_id on public.dashboard_users
  for each row execute function public.sync_user_roles_from_primary();


-- ----------------------------------------------------------------------------
-- PHẦN 2 — has_permission()/my_permissions() tính lại theo UNION toàn bộ
-- role trong user_roles (trước đây chỉ theo dashboard_users.role_id).
-- ----------------------------------------------------------------------------

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
    join public.user_roles ur on ur.user_id = du.id
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where du.id = auth.uid()
      and du.deleted_at is null
      and du.status = 'active'
      and p.key = permission_key
  );
$$;

create or replace function public.my_permissions()
returns table (permission_key text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct p.key
  from public.dashboard_users du
  join public.user_roles ur on ur.user_id = du.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where du.id = auth.uid()
    and du.deleted_at is null
    and du.status = 'active';
$$;


-- ----------------------------------------------------------------------------
-- PHẦN 3 — permission_scope: scope của 1 permission theo TỪNG role. Không có
-- dòng = mặc định 'all' (đúng hành vi Rev 14 hiện có — không phá vỡ gì).
-- ----------------------------------------------------------------------------

create table if not exists public.permission_scope (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_id  uuid not null references public.permissions (id) on delete cascade,
  scope          text not null check (scope in ('own', 'assigned', 'team', 'department', 'all')),
  created_at     timestamptz not null default now(),
  primary key (role_id, permission_id)
);
create index if not exists permission_scope_permission_id_idx on public.permission_scope (permission_id);

-- Scope rộng nhất được ưu tiên khi 1 user có NHIỀU role cùng cấp permission
-- này (vd vừa Author vừa Reviewer) — thứ tự nới rộng dần.
create or replace function public.scope_rank(s text)
returns integer
language sql
immutable
as $$
  select case s
    when 'own' then 0
    when 'assigned' then 1
    when 'team' then 2
    when 'department' then 3
    when 'all' then 4
    else 0
  end;
$$;

create or replace function public.my_permission_scope(permission_key text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(ps.scope, 'all')
  from public.dashboard_users du
  join public.user_roles ur on ur.user_id = du.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  left join public.permission_scope ps on ps.role_id = ur.role_id and ps.permission_id = p.id
  where du.id = auth.uid()
    and du.deleted_at is null
    and du.status = 'active'
    and p.key = permission_key
  order by public.scope_rank(coalesce(ps.scope, 'all')) desc
  limit 1;
$$;


-- ----------------------------------------------------------------------------
-- PHẦN 4 — ownership_policy: đăng ký module nào áp dụng ownership scope +
-- tên cột chuẩn (mọi module mở rộng sau này dùng ĐÚNG các tên cột này để
-- check_ownership_scope() dùng lại được nguyên vẹn, không cần sửa code).
-- ----------------------------------------------------------------------------

create table if not exists public.ownership_policy (
  module              text primary key,
  owner_column        text not null default 'owner_id',
  assigned_column     text not null default 'assigned_editor',
  reviewer_column     text not null default 'reviewer',
  publisher_column    text not null default 'publisher',
  department_column   text not null default 'department',
  team_column         text not null default 'team'
);

insert into public.ownership_policy (module) values ('articles') on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 5 — check_ownership_scope(): engine chung, nhận vào scope + 1 dòng
-- content dạng jsonb (to_jsonb(table.*) trong policy RLS) — không hardcode
-- theo tên bảng.
-- ----------------------------------------------------------------------------

create or replace function public.check_ownership_scope(p_scope text, p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  me uuid := public.my_author_id();
  my_dept uuid;
  my_team uuid;
  row_dept uuid;
  row_team uuid;
begin
  if p_scope = 'all' then
    return true;
  end if;

  if p_scope = 'own' then
    return me is not null and (p_row ->> 'owner_id') is not null and (p_row ->> 'owner_id')::uuid = me;
  end if;

  if p_scope = 'assigned' then
    -- assigned_editor/reviewer/publisher tham chiếu dashboard_users(id) —
    -- CHÍNH LÀ auth.uid() của người đó (Rev 13: dashboard_users.id = tài
    -- khoản Supabase Auth), khác với owner_id (tham chiếu authors(id), so
    -- bằng my_author_id()) — không được lẫn 2 định danh này với nhau (bug
    -- đã phát hiện khi test RLS trực tiếp: so sai me=my_author_id() ở đây
    -- khiến Reviewer không bao giờ khớp được dù đã được gán đúng).
    -- CỐ TÌNH không gồm owner_id — tác giả không tự động là người duyệt bài
    -- của chính mình, tránh xung đột lợi ích trong quy trình approve.
    return auth.uid() is not null and (
      (p_row ->> 'assigned_editor') is not null and (p_row ->> 'assigned_editor')::uuid = auth.uid()
      or (p_row ->> 'reviewer') is not null and (p_row ->> 'reviewer')::uuid = auth.uid()
      or (p_row ->> 'publisher') is not null and (p_row ->> 'publisher')::uuid = auth.uid()
    );
  end if;

  if p_scope = 'department' then
    select department_id into my_dept from public.dashboard_users where id = auth.uid();
    row_dept := nullif(p_row ->> 'department', '')::uuid;
    -- Dòng CHƯA gán department (NULL) = mở cho mọi editor phạm vi
    -- department thao tác (xem giải thích "an toàn ngược" ở đầu file).
    return row_dept is null or (my_dept is not null and row_dept = my_dept);
  end if;

  if p_scope = 'team' then
    select team_id into my_team from public.dashboard_users where id = auth.uid();
    row_team := nullif(p_row ->> 'team', '')::uuid;
    return row_team is null or (my_team is not null and row_team = my_team);
  end if;

  return false;
end;
$$;

create or replace function public.has_permission_scoped(permission_key text, p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.has_permission(permission_key) then
    return false;
  end if;
  return public.check_ownership_scope(public.my_permission_scope(permission_key), p_row);
end;
$$;


-- ----------------------------------------------------------------------------
-- PHẦN 6 — articles: thêm cột ownership chuẩn + trigger tự set.
-- ----------------------------------------------------------------------------

alter table public.articles
  add column if not exists owner_id         uuid references public.authors (id) on delete set null,
  add column if not exists created_by       uuid references public.dashboard_users (id) on delete set null,
  add column if not exists updated_by       uuid references public.dashboard_users (id) on delete set null,
  add column if not exists assigned_editor  uuid references public.dashboard_users (id) on delete set null,
  add column if not exists reviewer         uuid references public.dashboard_users (id) on delete set null,
  add column if not exists publisher        uuid references public.dashboard_users (id) on delete set null,
  add column if not exists department       uuid references public.departments (id) on delete set null,
  add column if not exists team             uuid references public.teams (id) on delete set null;

update public.articles set owner_id = author_id where owner_id is null;

create index if not exists articles_owner_id_idx on public.articles (owner_id);
create index if not exists articles_assigned_editor_idx on public.articles (assigned_editor);
create index if not exists articles_department_idx on public.articles (department);

-- owner_id LUÔN đồng bộ theo author_id (chưa có UI nào tách rời "người
-- đứng tên bài" khỏi "chủ sở hữu quyền sửa" — giữ đơn giản, tránh lệch dữ
-- liệu). created_by chỉ set lúc INSERT; updated_by set mỗi lần ghi.
create or replace function public.set_article_ownership_defaults()
returns trigger
language plpgsql
as $$
begin
  new.owner_id := new.author_id;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_articles_ownership_defaults on public.articles;
create trigger trg_articles_ownership_defaults
  before insert or update on public.articles
  for each row execute function public.set_article_ownership_defaults();


-- ----------------------------------------------------------------------------
-- PHẦN 7 — RLS articles/article_tags: thay has_permission() đơn thuần bằng
-- has_permission_scoped() (kế thừa is_active_editor() làm nền, không đổi).
-- ----------------------------------------------------------------------------

drop policy if exists "Editors can view all articles" on public.articles;
create policy "Editors can view all articles" on public.articles
  for select to authenticated using (
    public.is_active_editor() and public.has_permission_scoped('articles.view', to_jsonb(articles.*))
  );

drop policy if exists "Editors can insert articles" on public.articles;
create policy "Editors can insert articles" on public.articles
  for insert to authenticated with check (
    public.is_active_editor() and public.has_permission_scoped('articles.create', to_jsonb(articles.*))
  );

-- "articles.approve" PHẢI có mặt ở đây — Reviewer chỉ có permission approve
-- (không có edit/delete/publish), nếu thiếu, Reviewer sẽ không UPDATE được
-- dòng nào để lưu kết quả duyệt (status chuyển review -> published/archived
-- qua đúng form ArticleForm hiện có, không có bảng "approval" riêng).
drop policy if exists "Editors can update articles" on public.articles;
create policy "Editors can update articles" on public.articles
  for update to authenticated
  using (
    public.is_active_editor() and (
      public.has_permission_scoped('articles.edit', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.delete', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.publish', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.approve', to_jsonb(articles.*))
    )
  )
  with check (
    public.is_active_editor() and (
      public.has_permission_scoped('articles.edit', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.delete', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.publish', to_jsonb(articles.*))
      or public.has_permission_scoped('articles.approve', to_jsonb(articles.*))
    )
  );

drop policy if exists "Editors can view all article_tags" on public.article_tags;
create policy "Editors can view all article_tags" on public.article_tags
  for select to authenticated using (
    public.is_active_editor() and exists (
      select 1 from public.articles a where a.id = article_tags.article_id
        and public.has_permission_scoped('articles.view', to_jsonb(a.*))
    )
  );

drop policy if exists "Editors can insert article_tags" on public.article_tags;
create policy "Editors can insert article_tags" on public.article_tags
  for insert to authenticated with check (
    public.is_active_editor() and exists (
      select 1 from public.articles a where a.id = article_tags.article_id
        and public.has_permission_scoped('articles.edit', to_jsonb(a.*))
    )
  );

drop policy if exists "Editors can delete article_tags" on public.article_tags;
create policy "Editors can delete article_tags" on public.article_tags
  for delete to authenticated using (
    public.is_active_editor() and exists (
      select 1 from public.articles a where a.id = article_tags.article_id
        and public.has_permission_scoped('articles.edit', to_jsonb(a.*))
    )
  );


-- ----------------------------------------------------------------------------
-- PHẦN 8 — RLS cho 3 bảng mới.
-- ----------------------------------------------------------------------------

alter table public.user_roles enable row level security;
alter table public.permission_scope enable row level security;
alter table public.ownership_policy enable row level security;

drop policy if exists "Users can view own roles" on public.user_roles;
create policy "Users can view own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users.view can view all user_roles" on public.user_roles;
create policy "users.view can view all user_roles" on public.user_roles
  for select to authenticated using (public.has_permission('users.view'));
drop policy if exists "users.manage can insert user_roles" on public.user_roles;
create policy "users.manage can insert user_roles" on public.user_roles
  for insert to authenticated with check (public.has_permission('users.manage'));
drop policy if exists "users.manage can delete user_roles" on public.user_roles;
create policy "users.manage can delete user_roles" on public.user_roles
  for delete to authenticated using (public.has_permission('users.manage'));

drop policy if exists "Dashboard users can view permission_scope" on public.permission_scope;
create policy "Dashboard users can view permission_scope" on public.permission_scope
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "roles.manage can insert permission_scope" on public.permission_scope;
create policy "roles.manage can insert permission_scope" on public.permission_scope
  for insert to authenticated with check (public.has_permission('roles.manage'));
drop policy if exists "roles.manage can update permission_scope" on public.permission_scope;
create policy "roles.manage can update permission_scope" on public.permission_scope
  for update to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
drop policy if exists "roles.manage can delete permission_scope" on public.permission_scope;
create policy "roles.manage can delete permission_scope" on public.permission_scope
  for delete to authenticated using (public.has_permission('roles.manage'));

drop policy if exists "Dashboard users can view ownership_policy" on public.ownership_policy;
create policy "Dashboard users can view ownership_policy" on public.ownership_policy
  for select to authenticated using (public.is_active_dashboard_user());
drop policy if exists "system.manage can write ownership_policy" on public.ownership_policy;
create policy "system.manage can write ownership_policy" on public.ownership_policy
  for insert to authenticated with check (public.has_permission('system.manage'));
drop policy if exists "system.manage can update ownership_policy" on public.ownership_policy;
create policy "system.manage can update ownership_policy" on public.ownership_policy
  for update to authenticated using (public.has_permission('system.manage')) with check (public.has_permission('system.manage'));


-- ----------------------------------------------------------------------------
-- PHẦN 9 — Permission mới: articles.assign. Role mới: Publisher.
-- ----------------------------------------------------------------------------

insert into public.permissions (module, action, key, description)
values ('articles', 'assign', 'articles.assign', 'Gán assigned editor/reviewer/publisher cho bài viết')
on conflict (key) do nothing;

insert into public.roles (key, name, description, is_system, sort_order)
select 'publisher', 'Publisher', 'Publish/unpublish/archive bài viết đã duyệt.', true, 8
where not exists (select 1 from public.roles where key = 'publisher' and deleted_at is null);

-- QUAN TRỌNG (đã rút kinh nghiệm từ Rev 14): role_permissions là bảng nạp
-- sẵn — Super Admin/Administrator phải được cấp lại tường minh permission
-- MỚI (articles.assign) vừa thêm ở trên.
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
where r.key = 'managing_editor' and p.key = 'articles.assign'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'editor' and p.key = 'articles.assign'
on conflict do nothing;

-- Publisher: view + publish toàn bộ (scope 'all' — mặc định khi không có
-- dòng permission_scope, xem Phần 3).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'publisher' and p.key in ('dashboard.view', 'articles.view', 'articles.publish')
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 10 — Scope theo đúng ví dụ trong spec:
--   Author.articles.edit   -> Own
--   Editor.articles.edit   -> Department
--   Managing Editor.articles.edit -> All (không cần seed — mặc định)
--
-- Author/Contributor trước đây (Rev 14) dùng riêng permission
-- "articles.edit_own" — nay hợp nhất về đúng model chuẩn: có
-- "articles.edit"/"articles.create" (role_permissions, tồn tại = có
-- quyền) + scope "own" (permission_scope). Permission "articles.edit_own"
-- (Rev 14) không còn được RLS nào tham chiếu — giữ lại trong catalog vì lý
-- do lịch sử, không gây ảnh hưởng.
-- ----------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('author', 'contributor') and p.key in ('articles.edit', 'articles.create')
on conflict do nothing;

insert into public.permission_scope (role_id, permission_id, scope)
select r.id, p.id, 'own'
from public.roles r cross join public.permissions p
where r.key in ('author', 'contributor') and p.key in ('articles.edit', 'articles.create')
on conflict (role_id, permission_id) do update set scope = excluded.scope;

-- QUAN TRỌNG: Editor đã có sẵn "articles.publish" từ seed gốc Rev 13 (không
-- scope = mặc định 'all') — nếu không siết luôn permission này về cùng
-- scope 'department', policy UPDATE (OR nhiều permission với nhau) vẫn cho
-- Editor sửa MỌI department qua nhánh articles.publish dù articles.edit đã
-- đúng bị chặn (lỗ hổng phát hiện khi test RLS trực tiếp — xem phần xác
-- nhận cuối file).
insert into public.permission_scope (role_id, permission_id, scope)
select r.id, p.id, 'department'
from public.roles r cross join public.permissions p
where r.key = 'editor' and p.key in ('articles.edit', 'articles.create', 'articles.publish')
on conflict (role_id, permission_id) do update set scope = excluded.scope;

insert into public.permission_scope (role_id, permission_id, scope)
select r.id, p.id, 'department'
from public.roles r cross join public.permissions p
where r.key = 'editor' and p.key = 'articles.assign'
on conflict (role_id, permission_id) do update set scope = excluded.scope;

-- Reviewer: giữ nguyên articles.view = 'all' (không seed = mặc định all,
-- không đổi hành vi xem hiện có), chỉ siết approve về 'assigned' — chỉ
-- duyệt bài đã được gán reviewer = chính mình (tránh tự duyệt bài do chính
-- mình phụ trách biên tập, và khớp đúng ý nghĩa "review/approve" trong
-- spec). Reviewer sẽ KHÔNG duyệt được gì cho tới khi có bài được gán
-- reviewer qua ArticleForm — đây là giới hạn CÓ CHỦ ĐÍCH của tính năng mới,
-- không phải lỗi.
insert into public.permission_scope (role_id, permission_id, scope)
select r.id, p.id, 'assigned'
from public.roles r cross join public.permissions p
where r.key = 'reviewer' and p.key = 'articles.approve'
on conflict (role_id, permission_id) do update set scope = excluded.scope;

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--
--   select r.key, p.key, ps.scope from public.permission_scope ps
--   join public.roles r on r.id = ps.role_id
--   join public.permissions p on p.id = ps.permission_id
--   order by r.key, p.key;
--
--   select id, owner_id, author_id, department, team from public.articles limit 5;
--
--   select ur.user_id, r.key from public.user_roles ur
--   join public.roles r on r.id = ur.role_id order by ur.user_id;
-- ============================================================================
