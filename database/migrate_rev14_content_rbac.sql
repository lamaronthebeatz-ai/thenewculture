-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 14: Dashboard V2.1.1 — mở rộng RBAC ra
-- toàn bộ bảng nội dung hiện có + tự động cấp phát Dashboard User + phân
-- quyền theo chủ sở hữu cho Author/Contributor.
--
-- Đây là 3 trong 4 đề xuất "Dashboard V2.2" ở báo cáo V2.1 (mục còn lại —
-- Edge Function tạo tài khoản Auth — xem migration/README riêng cho Edge
-- Function, không cần thay đổi CSDL; mục code-split bundle Dashboard không
-- liên quan CSDL).
--
-- 1) RBAC granular trên bảng nội dung: trước Rev 14, MỌI bảng nội dung
--    (articles, authors, categories, series, tags, media, hero_slots, ads,
--    promotions, announcements, menus/menu_items/footer, site_settings,
--    magazine_issues) chỉ gác bằng is_active_editor() — nhị phân, editor
--    active là ghi được MỌI thứ, không phân biệt role/permission. Rev 14
--    kết hợp thêm has_permission() (Rev 13) vào từng policy: vẫn giữ
--    is_active_editor() làm điều kiện NỀN (không đổi cách xác định "ai là
--    editor"), CỘNG THÊM permission cụ thể theo module x action.
--
--    An toàn ngược: bootstrap Rev 13 đã gán Super Admin (mọi permission) cho
--    toàn bộ author đang active — không ai đang có quyền bị mất quyền ngay
--    sau khi chạy migration này.
--
-- 2) Cấp phát dashboard_users tự động: Rev 13 chỉ seed dashboard_users MỘT
--    LẦN lúc migrate. Sau Rev 14, is_active_editor()=true (tài khoản Auth +
--    authors.email khớp + is_active) mà CHƯA có dashboard_users sẽ có ngay 1
--    hồ sơ mặc định role "editor" (không phải Super Admin) — giữ đúng quy
--    trình onboarding gốc "tạo authors row khớp email = có quyền Dashboard"
--    của Rev 5, không bắt buộc thêm bước thủ công nào.
--
-- 3) Ownership cho Author/Contributor: 2 role này trước đây (Rev 13 seed)
--    hoặc chưa sửa được gì (Contributor) hoặc sửa được MỌI article
--    (Author — "articles.edit" không phân biệt tác giả). Rev 14 thêm
--    permission mới "articles.edit_own" (chỉ sửa bài có author_id = chính
--    mình, qua dashboard_users.author_id đã có sẵn từ Rev 13) — gỡ
--    "articles.edit" (sửa MỌI bài) khỏi Author, thay bằng "articles.edit_own",
--    và cấp thêm "articles.edit_own" cho Contributor (trước đây không sửa
--    được gì sau khi tạo). magazine_issues KHÔNG có cột tác giả/người tạo
--    nào (xem migrate_rev11_magazine.sql) nên không áp dụng ownership được
--    ở đây — giữ nguyên magazine.edit như cũ cho Author.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PHẦN 1 — Mở rộng permission catalog: module "tags", "hero" (trước đây
-- chưa có permission riêng dù Dashboard đã có trang Tags/Hero Manager), và
-- action "edit_own" cho articles (sửa nội dung của chính mình).
-- ----------------------------------------------------------------------------

insert into public.permissions (module, action, key, description)
values
  ('tags', 'view', 'tags.view', 'Xem tag'),
  ('tags', 'create', 'tags.create', 'Tạo tag mới'),
  ('tags', 'edit', 'tags.edit', 'Sửa tag'),
  ('tags', 'delete', 'tags.delete', 'Xoá (soft delete) tag'),

  ('hero', 'view', 'hero.view', 'Xem hero slot'),
  ('hero', 'create', 'hero.create', 'Tạo hero slot mới'),
  ('hero', 'edit', 'hero.edit', 'Sửa hero slot'),
  ('hero', 'delete', 'hero.delete', 'Xoá (soft delete) hero slot'),

  ('articles', 'edit_own', 'articles.edit_own', 'Chỉ sửa bài viết có author_id là chính mình')
on conflict (key) do nothing;

-- QUAN TRỌNG: role_permissions là bảng NẠP SẴN (không phải view tính động)
-- — permission MỚI thêm ở trên (tags/hero/articles.edit_own) KHÔNG tự động
-- có mặt trong role_permissions của super_admin/administrator dù 2 role này
-- "toàn quyền" theo thiết kế (seed Rev 13 chỉ cross join đúng tập permission
-- tồn tại LÚC ĐÓ). Phải bổ sung lại tường minh ở đây mỗi khi thêm permission
-- mới — an toàn chạy lại nhiều lần (on conflict do nothing).
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
where r.key = 'managing_editor' and p.module in ('tags', 'hero')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'editor' and p.module in ('tags', 'hero') and p.action in ('view', 'create', 'edit', 'publish')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'reviewer' and p.module in ('tags', 'hero') and p.action = 'view'
on conflict do nothing;

-- Author trước đây có "articles.edit" (sửa MỌI bài) từ seed Rev 13 — đổi
-- thành "articles.edit_own" đúng yêu cầu v2.1.1 "chỉ sửa nội dung của chính
-- mình". Đây là thay đổi hành vi CÓ CHỦ ĐÍCH (không phải tương thích ngược
-- 100% với Rev 13 — Author từ nay không còn sửa được bài của người khác).
delete from public.role_permissions
where role_id = (select id from public.roles where key = 'author' and deleted_at is null)
  and permission_id = (select id from public.permissions where key = 'articles.edit');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('author', 'contributor') and p.key = 'articles.edit_own'
on conflict do nothing;


-- ----------------------------------------------------------------------------
-- PHẦN 2 — my_author_id(): author_id của dashboard_users hiện tại, dùng để
-- so khớp quyền sở hữu trong policy articles/article_tags.
-- ----------------------------------------------------------------------------

create or replace function public.my_author_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select author_id
  from public.dashboard_users
  where id = auth.uid()
    and deleted_at is null
    and status = 'active';
$$;


-- ----------------------------------------------------------------------------
-- PHẦN 3 — Tự động cấp phát dashboard_users khi 1 authors row trở thành
-- active và khớp 1 tài khoản Supabase Auth đã tồn tại nhưng CHƯA có hồ sơ
-- Dashboard User — giữ nguyên quy trình onboarding gốc của Rev 5 (chỉ cần
-- tạo/kích hoạt authors row khớp email, không cần thao tác CSDL thủ công
-- nào thêm). Role mặc định "editor" (không phải Super Admin — Super Admin
-- chỉ dành cho lô bootstrap ban đầu ở Rev 13).
-- ----------------------------------------------------------------------------

create or replace function public.sync_dashboard_user_for_author()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_auth_id uuid;
  default_role_id uuid;
begin
  if new.deleted_at is not null or new.is_active is not true or new.email is null then
    return new;
  end if;

  select u.id into matched_auth_id from auth.users u where lower(u.email) = lower(new.email) limit 1;
  if matched_auth_id is null then
    return new;
  end if;

  if exists (select 1 from public.dashboard_users where id = matched_auth_id) then
    -- Đã có hồ sơ Dashboard User — chỉ đồng bộ lại liên kết author_id nếu
    -- đang trống, KHÔNG ghi đè role/status đã được gán/tuỳ chỉnh trước đó.
    update public.dashboard_users set author_id = new.id where id = matched_auth_id and author_id is null;
    return new;
  end if;

  select id into default_role_id from public.roles where key = 'editor' and deleted_at is null;

  insert into public.dashboard_users (id, author_id, role_id, email, status, display_name, provider)
  values (matched_auth_id, new.id, default_role_id, new.email, 'active', new.name, 'email')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_authors_sync_dashboard_user on public.authors;
create trigger trg_authors_sync_dashboard_user
  after insert or update on public.authors
  for each row execute function public.sync_dashboard_user_for_author();


-- ----------------------------------------------------------------------------
-- PHẦN 4 — RLS: kết hợp has_permission() vào các policy "Editors can ..."
-- hiện có trên toàn bộ bảng nội dung. is_active_editor() vẫn là điều kiện
-- nền bắt buộc (giữ nguyên định nghĩa "ai là editor" từ Rev 5) — CHỈ thêm
-- has_permission() làm điều kiện lọc chi tiết hơn theo module x action.
-- ----------------------------------------------------------------------------

-- articles — có ownership (author_id): edit_own chỉ áp dụng cho UPDATE, còn
-- SELECT-all/INSERT dùng chung view/create như mọi module khác (Author cần
-- xem toàn bộ + tạo bài mới bình thường, chỉ giới hạn ở khâu SỬA).
drop policy if exists "Editors can view all articles" on public.articles;
create policy "Editors can view all articles" on public.articles
  for select to authenticated using (public.is_active_editor() and public.has_permission('articles.view'));

drop policy if exists "Editors can insert articles" on public.articles;
create policy "Editors can insert articles" on public.articles
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('articles.create'));

drop policy if exists "Editors can update articles" on public.articles;
create policy "Editors can update articles" on public.articles
  for update to authenticated
  using (
    public.is_active_editor() and (
      public.has_permission('articles.edit')
      or public.has_permission('articles.delete')
      or (public.has_permission('articles.edit_own') and author_id = public.my_author_id())
    )
  )
  with check (
    public.is_active_editor() and (
      public.has_permission('articles.edit')
      or public.has_permission('articles.delete')
      or (public.has_permission('articles.edit_own') and author_id = public.my_author_id())
    )
  );

-- authors
drop policy if exists "Editors can view all authors" on public.authors;
create policy "Editors can view all authors" on public.authors
  for select to authenticated using (public.is_active_editor() and public.has_permission('authors.view'));
drop policy if exists "Editors can insert authors" on public.authors;
create policy "Editors can insert authors" on public.authors
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('authors.create'));
drop policy if exists "Editors can update authors" on public.authors;
create policy "Editors can update authors" on public.authors
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('authors.edit') or public.has_permission('authors.delete')))
  with check (public.is_active_editor() and (public.has_permission('authors.edit') or public.has_permission('authors.delete')));

-- categories
drop policy if exists "Editors can view all categories" on public.categories;
create policy "Editors can view all categories" on public.categories
  for select to authenticated using (public.is_active_editor() and public.has_permission('categories.view'));
drop policy if exists "Editors can insert categories" on public.categories;
create policy "Editors can insert categories" on public.categories
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('categories.create'));
drop policy if exists "Editors can update categories" on public.categories;
create policy "Editors can update categories" on public.categories
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('categories.edit') or public.has_permission('categories.delete')))
  with check (public.is_active_editor() and (public.has_permission('categories.edit') or public.has_permission('categories.delete')));

-- series
drop policy if exists "Editors can view all series" on public.series;
create policy "Editors can view all series" on public.series
  for select to authenticated using (public.is_active_editor() and public.has_permission('series.view'));
drop policy if exists "Editors can insert series" on public.series;
create policy "Editors can insert series" on public.series
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('series.create'));
drop policy if exists "Editors can update series" on public.series;
create policy "Editors can update series" on public.series
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('series.edit') or public.has_permission('series.delete')))
  with check (public.is_active_editor() and (public.has_permission('series.edit') or public.has_permission('series.delete')));

-- tags
drop policy if exists "Editors can view all tags" on public.tags;
create policy "Editors can view all tags" on public.tags
  for select to authenticated using (public.is_active_editor() and public.has_permission('tags.view'));
drop policy if exists "Editors can insert tags" on public.tags;
create policy "Editors can insert tags" on public.tags
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('tags.create'));
drop policy if exists "Editors can update tags" on public.tags;
create policy "Editors can update tags" on public.tags
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('tags.edit') or public.has_permission('tags.delete')))
  with check (public.is_active_editor() and (public.has_permission('tags.edit') or public.has_permission('tags.delete')));

-- media
drop policy if exists "Editors can view all media" on public.media;
create policy "Editors can view all media" on public.media
  for select to authenticated using (public.is_active_editor() and public.has_permission('media.view'));
drop policy if exists "Editors can insert media" on public.media;
create policy "Editors can insert media" on public.media
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('media.create'));
drop policy if exists "Editors can update media" on public.media;
create policy "Editors can update media" on public.media
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('media.edit') or public.has_permission('media.delete')))
  with check (public.is_active_editor() and (public.has_permission('media.edit') or public.has_permission('media.delete')));

-- media_folders
drop policy if exists "Editors can view all media folders" on public.media_folders;
create policy "Editors can view all media folders" on public.media_folders
  for select to authenticated using (public.is_active_editor() and public.has_permission('media.view'));
drop policy if exists "Editors can insert media folders" on public.media_folders;
create policy "Editors can insert media folders" on public.media_folders
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('media.create'));
drop policy if exists "Editors can update media folders" on public.media_folders;
create policy "Editors can update media folders" on public.media_folders
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('media.edit') or public.has_permission('media.delete')))
  with check (public.is_active_editor() and (public.has_permission('media.edit') or public.has_permission('media.delete')));

-- media_tags — bảng nối thuần, không có ownership riêng (media không phân
-- theo tác giả).
drop policy if exists "Editors can view all media_tags" on public.media_tags;
create policy "Editors can view all media_tags" on public.media_tags
  for select to authenticated using (public.is_active_editor() and public.has_permission('media.view'));
drop policy if exists "Editors can insert media_tags" on public.media_tags;
create policy "Editors can insert media_tags" on public.media_tags
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('media.edit'));
drop policy if exists "Editors can delete media_tags" on public.media_tags;
create policy "Editors can delete media_tags" on public.media_tags
  for delete to authenticated using (public.is_active_editor() and public.has_permission('media.edit'));

-- article_tags — bảng nối thuần, NHƯNG ownership kế thừa từ article cha (nếu
-- chỉ có articles.edit_own, chỉ gắn/gỡ tag được trên bài của chính mình).
drop policy if exists "Editors can view all article_tags" on public.article_tags;
create policy "Editors can view all article_tags" on public.article_tags
  for select to authenticated using (public.is_active_editor() and public.has_permission('articles.view'));

drop policy if exists "Editors can insert article_tags" on public.article_tags;
create policy "Editors can insert article_tags" on public.article_tags
  for insert to authenticated with check (
    public.is_active_editor() and (
      public.has_permission('articles.edit')
      or (
        public.has_permission('articles.edit_own')
        and exists (select 1 from public.articles a where a.id = article_tags.article_id and a.author_id = public.my_author_id())
      )
    )
  );

drop policy if exists "Editors can delete article_tags" on public.article_tags;
create policy "Editors can delete article_tags" on public.article_tags
  for delete to authenticated using (
    public.is_active_editor() and (
      public.has_permission('articles.edit')
      or (
        public.has_permission('articles.edit_own')
        and exists (select 1 from public.articles a where a.id = article_tags.article_id and a.author_id = public.my_author_id())
      )
    )
  );

-- site_settings / footer_settings — bảng singleton, chỉ có UPDATE (SELECT
-- công khai đã có sẵn từ trước, không đổi).
drop policy if exists "Editors can update site settings" on public.site_settings;
create policy "Editors can update site settings" on public.site_settings
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')))
  with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));

drop policy if exists "Editors can update footer settings" on public.footer_settings;
create policy "Editors can update footer settings" on public.footer_settings
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')))
  with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));

-- menu_items
drop policy if exists "Editors can view all menu_items" on public.menu_items;
create policy "Editors can view all menu_items" on public.menu_items
  for select to authenticated using (public.is_active_editor() and public.has_permission('settings.view'));
drop policy if exists "Editors can insert menu_items" on public.menu_items;
create policy "Editors can insert menu_items" on public.menu_items
  for insert to authenticated with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));
drop policy if exists "Editors can update menu_items" on public.menu_items;
create policy "Editors can update menu_items" on public.menu_items
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')))
  with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));

-- footer_partners
drop policy if exists "Editors can view all footer partners" on public.footer_partners;
create policy "Editors can view all footer partners" on public.footer_partners
  for select to authenticated using (public.is_active_editor() and public.has_permission('settings.view'));
drop policy if exists "Editors can insert footer partners" on public.footer_partners;
create policy "Editors can insert footer partners" on public.footer_partners
  for insert to authenticated with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));
drop policy if exists "Editors can update footer partners" on public.footer_partners;
create policy "Editors can update footer partners" on public.footer_partners
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')))
  with check (public.is_active_editor() and (public.has_permission('settings.edit') or public.has_permission('settings.manage')));

-- hero_slots
drop policy if exists "Editors can view all hero slots" on public.hero_slots;
create policy "Editors can view all hero slots" on public.hero_slots
  for select to authenticated using (public.is_active_editor() and public.has_permission('hero.view'));
drop policy if exists "Editors can insert hero slots" on public.hero_slots;
create policy "Editors can insert hero slots" on public.hero_slots
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('hero.create'));
drop policy if exists "Editors can update hero slots" on public.hero_slots;
create policy "Editors can update hero slots" on public.hero_slots
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('hero.edit') or public.has_permission('hero.delete')))
  with check (public.is_active_editor() and (public.has_permission('hero.edit') or public.has_permission('hero.delete')));

-- ads
drop policy if exists "Editors can view all ads" on public.ads;
create policy "Editors can view all ads" on public.ads
  for select to authenticated using (public.is_active_editor() and public.has_permission('advertisements.view'));
drop policy if exists "Editors can insert ads" on public.ads;
create policy "Editors can insert ads" on public.ads
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('advertisements.create'));
drop policy if exists "Editors can update ads" on public.ads;
create policy "Editors can update ads" on public.ads
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('advertisements.edit') or public.has_permission('advertisements.delete')))
  with check (public.is_active_editor() and (public.has_permission('advertisements.edit') or public.has_permission('advertisements.delete')));

-- promotions
drop policy if exists "Editors can view all promotions" on public.promotions;
create policy "Editors can view all promotions" on public.promotions
  for select to authenticated using (public.is_active_editor() and public.has_permission('promotions.view'));
drop policy if exists "Editors can insert promotions" on public.promotions;
create policy "Editors can insert promotions" on public.promotions
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('promotions.create'));
drop policy if exists "Editors can update promotions" on public.promotions;
create policy "Editors can update promotions" on public.promotions
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('promotions.edit') or public.has_permission('promotions.delete')))
  with check (public.is_active_editor() and (public.has_permission('promotions.edit') or public.has_permission('promotions.delete')));

-- announcements
drop policy if exists "Editors can view all announcements" on public.announcements;
create policy "Editors can view all announcements" on public.announcements
  for select to authenticated using (public.is_active_editor() and public.has_permission('announcements.view'));
drop policy if exists "Editors can insert announcements" on public.announcements;
create policy "Editors can insert announcements" on public.announcements
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('announcements.create'));
drop policy if exists "Editors can update announcements" on public.announcements;
create policy "Editors can update announcements" on public.announcements
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('announcements.edit') or public.has_permission('announcements.delete')))
  with check (public.is_active_editor() and (public.has_permission('announcements.edit') or public.has_permission('announcements.delete')));

-- magazine_issues — không có cột tác giả/người tạo, không áp dụng ownership.
drop policy if exists "Editors can view all magazine issues" on public.magazine_issues;
create policy "Editors can view all magazine issues" on public.magazine_issues
  for select to authenticated using (public.is_active_editor() and public.has_permission('magazine.view'));
drop policy if exists "Editors can insert magazine issues" on public.magazine_issues;
create policy "Editors can insert magazine issues" on public.magazine_issues
  for insert to authenticated with check (public.is_active_editor() and public.has_permission('magazine.create'));
drop policy if exists "Editors can update magazine issues" on public.magazine_issues;
create policy "Editors can update magazine issues" on public.magazine_issues
  for update to authenticated
  using (public.is_active_editor() and (public.has_permission('magazine.edit') or public.has_permission('magazine.delete')))
  with check (public.is_active_editor() and (public.has_permission('magazine.edit') or public.has_permission('magazine.delete')));

-- storage "media" bucket (Rev 5) — upload/sửa/xoá file thật.
drop policy if exists "Editors can upload media bucket" on storage.objects;
create policy "Editors can upload media bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_active_editor() and public.has_permission('media.create'));

drop policy if exists "Editors can update media bucket" on storage.objects;
create policy "Editors can update media bucket" on storage.objects
  for update to authenticated using (
    bucket_id = 'media' and public.is_active_editor()
    and (public.has_permission('media.edit') or public.has_permission('media.delete'))
  );

drop policy if exists "Editors can delete media bucket" on storage.objects;
create policy "Editors can delete media bucket" on storage.objects
  for delete to authenticated using (
    bucket_id = 'media' and public.is_active_editor()
    and (public.has_permission('media.edit') or public.has_permission('media.delete'))
  );

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc):
--
--   select key from public.permissions where module in ('tags','hero') order by key;
--   select r.key, count(*) from public.role_permissions rp
--   join public.roles r on r.id = rp.role_id
--   join public.permissions p on p.id = rp.permission_id
--   where p.key in ('articles.edit','articles.edit_own') group by r.key;
--
--   select policyname, cmd from pg_policies where schemaname = 'public'
--   and tablename = 'articles' order by cmd;
-- ============================================================================
