-- ============================================================================
-- TNC Platform v2.0 — PostgreSQL Schema
-- Target: Supabase Postgres (chạy trực tiếp trong SQL Editor)
-- 7 bảng lõi: authors, categories, series, tags, articles, article_tags, media
--
-- Bao gồm: PRIMARY KEY, FOREIGN KEY, UNIQUE (qua partial unique index cho
-- các cột có soft-delete), INDEX, CHECK, DEFAULT, created_at/updated_at/
-- deleted_at, trigger tự cập nhật updated_at, và RLS (Row Level Security)
-- baseline theo khuyến nghị của Supabase.
--
-- An toàn để chạy lại nhiều lần: mọi CREATE dùng IF NOT EXISTS / OR REPLACE.
--
-- Rev 2 (kèm seed.sql/test.sql): mở rộng articles.status từ 3 lên 5 giá trị
-- (draft/review/scheduled/published/archived) — xem giải thích tại chỗ định
-- nghĩa cột bên dưới. Không có thay đổi schema nào khác.
--
-- Rev 3 — Nền tảng Login + Membership: thêm 3 bảng MỚI (profiles,
-- membership_plans, memberships) + trigger tự tạo profile khi có user đăng
-- ký qua Supabase Auth + RLS/policy cho cả 3. KHÔNG sửa 7 bảng lõi ở trên
-- (authors/categories/series/tags/articles/article_tags/media) — đúng theo
-- yêu cầu "giữ nguyên schema khác nếu không bắt buộc phải sửa". Xem chi tiết
-- lý do thiết kế ở phần "10. LOGIN + MEMBERSHIP" bên dưới và trong
-- DATABASE_DOCUMENTATION.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 0.1 SHARED TRIGGER FUNCTION: tự set updated_at = now() mỗi lần UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. authors — biên tập viên / tác giả
-- ============================================================================
create table if not exists public.authors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  name          text not null,
  email         text,
  avatar_url    text,
  bio           text,
  role          text not null default 'editor'
                check (role in ('editor-in-chief', 'deputy-editor', 'managing-editor',
                                 'senior-editor', 'editor', 'contributor', 'guest')),
  honor         text,                                  -- vinh danh chính (nếu có)
  badges        jsonb not null default '[]'::jsonb,     -- danh sách badge id, vd ["founder","hiphop-expert"]
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint authors_email_format check (
    email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint authors_badges_is_array check (jsonb_typeof(badges) = 'array')
);

-- UNIQUE có điều kiện: cho phép tái sử dụng slug/email sau khi soft-delete
create unique index if not exists authors_slug_key on public.authors (slug) where deleted_at is null;
create unique index if not exists authors_email_key on public.authors (email) where deleted_at is null and email is not null;
create index if not exists authors_deleted_at_idx on public.authors (deleted_at);
create index if not exists authors_role_idx on public.authors (role);

drop trigger if exists trg_authors_updated_at on public.authors;
create trigger trg_authors_updated_at
  before update on public.authors
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. categories — chuyên mục (hỗ trợ phân cấp qua parent_id)
-- ============================================================================
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references public.categories (id) on delete set null,
  slug          text not null,
  name          text not null,
  description   text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint categories_not_self_parent check (parent_id is distinct from id)
);

create unique index if not exists categories_slug_key on public.categories (slug) where deleted_at is null;
create index if not exists categories_parent_id_idx on public.categories (parent_id);
create index if not exists categories_deleted_at_idx on public.categories (deleted_at);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. series — tuyến nội dung / chuyên đề dài kỳ
-- ============================================================================
create table if not exists public.series (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  code            text,                  -- mã lưu trữ ngắn, vd "TNC·001"
  name            text not null,
  description     text,
  cover_image_url text,
  accent_color    text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists series_slug_key on public.series (slug) where deleted_at is null;
create index if not exists series_deleted_at_idx on public.series (deleted_at);
create index if not exists series_sort_order_idx on public.series (sort_order);

drop trigger if exists trg_series_updated_at on public.series;
create trigger trg_series_updated_at
  before update on public.series
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. tags — từ khóa tự do
-- ============================================================================
create table if not exists public.tags (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,
  name          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists tags_slug_key on public.tags (slug) where deleted_at is null;
create unique index if not exists tags_name_key on public.tags (name) where deleted_at is null;
create index if not exists tags_deleted_at_idx on public.tags (deleted_at);

drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. articles — bài viết
-- ============================================================================
create table if not exists public.articles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  title             text not null,
  dek               text,                  -- tóm tắt ngắn
  body              text,                  -- nội dung (markdown/html/plaintext tùy tầng render)
  cover_image_url   text,
  cover_credit      text,
  author_id         uuid not null references public.authors (id) on delete restrict,
  series_id         uuid references public.series (id) on delete set null,
  category_id       uuid references public.categories (id) on delete set null,
  -- SCHEMA CHANGE (đợt seed/test hoá dữ liệu): mở rộng danh sách trạng thái
  -- từ ('draft','published','archived') thành đủ 5 bước quy trình biên tập
  -- thực tế của TNC: draft -> review -> scheduled -> published -> archived.
  -- Lý do: yêu cầu seed dữ liệu ở nhiều trạng thái (bao gồm "review" và
  -- "scheduled") không thể thực hiện được với 3 giá trị cũ — đây là thay đổi
  -- BẮT BUỘC, tối thiểu (chỉ nới rộng danh sách CHECK, không đổi tên/kiểu cột,
  -- không đổi logic published_at bên dưới). Dữ liệu hiện có không bị ảnh
  -- hưởng vì 3 giá trị cũ vẫn hợp lệ.
  status            text not null default 'draft'
                    check (status in ('draft', 'review', 'scheduled', 'published', 'archived')),
  featured          boolean not null default false,
  hero_priority     boolean not null default false,
  read_time_minutes integer not null default 0 check (read_time_minutes >= 0),
  view_count        integer not null default 0 check (view_count >= 0),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint articles_published_requires_date check (
    (status = 'published' and published_at is not null) or (status <> 'published')
  )
);

create unique index if not exists articles_slug_key on public.articles (slug) where deleted_at is null;
create index if not exists articles_author_id_idx on public.articles (author_id);
create index if not exists articles_series_id_idx on public.articles (series_id);
create index if not exists articles_category_id_idx on public.articles (category_id);
create index if not exists articles_status_idx on public.articles (status);
create index if not exists articles_published_at_idx on public.articles (published_at desc);
create index if not exists articles_deleted_at_idx on public.articles (deleted_at);
create index if not exists articles_featured_idx on public.articles (featured) where featured = true;

drop trigger if exists trg_articles_updated_at on public.articles;
create trigger trg_articles_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 6. article_tags — bảng nối N-N giữa articles và tags
-- ============================================================================
create table if not exists public.article_tags (
  article_id  uuid not null references public.articles (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (article_id, tag_id)
);

create index if not exists article_tags_tag_id_idx on public.article_tags (tag_id);
create index if not exists article_tags_article_id_idx on public.article_tags (article_id);

-- ============================================================================
-- 7. media — thư viện ảnh/video/gif
-- ============================================================================
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  type          text not null check (type in ('image', 'gif', 'video', 'audio', 'document')),
  alt_text      text,
  width         integer check (width is null or width > 0),
  height        integer check (height is null or height > 0),
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by   uuid references public.authors (id) on delete set null,
  article_id    uuid references public.articles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists media_url_key on public.media (url) where deleted_at is null;
create index if not exists media_uploaded_by_idx on public.media (uploaded_by);
create index if not exists media_article_id_idx on public.media (article_id);
create index if not exists media_type_idx on public.media (type);
create index if not exists media_deleted_at_idx on public.media (deleted_at);

drop trigger if exists trg_media_updated_at on public.media;
create trigger trg_media_updated_at
  before update on public.media
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (khuyến nghị chuẩn Supabase)
-- Baseline: cho phép đọc công khai nội dung đã publish/chưa xoá; ghi/sửa/xoá
-- để trống (không có policy) -> chỉ service_role (bỏ qua RLS) mới ghi được.
-- Điều chỉnh lại theo mô hình auth thực tế của bạn (vd thêm policy cho
-- authenticated + kiểm tra quyền biên tập).
-- ============================================================================
alter table public.authors      enable row level security;
alter table public.categories   enable row level security;
alter table public.series       enable row level security;
alter table public.tags         enable row level security;
alter table public.articles     enable row level security;
alter table public.article_tags enable row level security;
alter table public.media        enable row level security;

drop policy if exists "Public read active authors" on public.authors;
create policy "Public read active authors" on public.authors
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Public read categories" on public.categories;
create policy "Public read categories" on public.categories
  for select using (deleted_at is null);

drop policy if exists "Public read series" on public.series;
create policy "Public read series" on public.series
  for select using (deleted_at is null);

drop policy if exists "Public read tags" on public.tags;
create policy "Public read tags" on public.tags
  for select using (deleted_at is null);

drop policy if exists "Public read published articles" on public.articles;
create policy "Public read published articles" on public.articles
  for select using (deleted_at is null and status = 'published');

drop policy if exists "Public read article_tags of published articles" on public.article_tags;
create policy "Public read article_tags of published articles" on public.article_tags
  for select using (
    exists (
      select 1 from public.articles a
      where a.id = article_tags.article_id
        and a.deleted_at is null
        and a.status = 'published'
    )
  );

drop policy if exists "Public read media" on public.media;
create policy "Public read media" on public.media
  for select using (deleted_at is null);

-- ============================================================================
-- 10. LOGIN + MEMBERSHIP (Rev 3) — 3 bảng mới: profiles, membership_plans,
-- memberships. Không sửa 7 bảng lõi ở trên. Phạm vi CHỈ Login + Membership —
-- không có Dashboard/API/UI ở đây.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 10.1 profiles — liên kết 1-1 với auth.users (do Supabase Auth quản lý)
--
-- Thiết kế 1-1: id CHÍNH LÀ khóa chính, đồng thời là khóa ngoại tới
-- auth.users(id) — đây là cách chuẩn/idiomatic của Supabase để đảm bảo 1-1
-- thật sự (không dùng thêm 1 cột user_id + UNIQUE riêng), và ON DELETE CASCADE
-- để xoá auth.users kéo theo xoá đúng 1 profile tương ứng.
--
-- KHÔNG lưu lại `email` ở đây (đã có trong auth.users, tránh trùng lặp/lệch
-- dữ liệu — auth.users là nguồn sự thật duy nhất cho email/mật khẩu).
--
-- KHÔNG có deleted_at (khác với quy ước soft-delete ở 7 bảng lõi): vòng đời
-- của profiles gắn chặt 1-1 với auth.users (Supabase quản lý), xoá profile
-- độc lập với việc xoá tài khoản đăng nhập không có ý nghĩa sản phẩm rõ ràng.
-- Dùng `is_active` (cùng mẫu với authors.is_active) khi cần "vô hiệu hoá" mà
-- không xoá.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text,
  display_name  text,
  avatar_url    text,
  bio           text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,30}$'
  )
);

-- username không bắt buộc (NULL cho tới khi user tự chọn) nhưng nếu đã đặt
-- thì phải duy nhất. Không cần partial index (không có deleted_at ở bảng
-- này) — UNIQUE thường của Postgres đã cho phép nhiều NULL cùng lúc.
create unique index if not exists profiles_username_key on public.profiles (username);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Tự động tạo 1 profile mỗi khi có user đăng ký mới qua Supabase Auth.
-- security definer + search_path cố định: bắt buộc để trigger (chạy dưới
-- quyền nội bộ của Supabase Auth khi insert vào auth.users) có thể ghi được
-- vào public.profiles, đồng thời tránh rủi ro search_path bị thao túng.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 10.2 membership_plans — danh mục các gói thành viên (Free/Premium/...)
-- Không phụ thuộc auth.users/profiles — có thể seed ngay, độc lập.
-- ----------------------------------------------------------------------------
create table if not exists public.membership_plans (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  name              text not null,
  description       text,
  price_cents       integer not null default 0 check (price_cents >= 0),
  currency          text not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  billing_interval  text not null default 'month'
                    check (billing_interval in ('month', 'year', 'lifetime')),
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create unique index if not exists membership_plans_slug_key on public.membership_plans (slug) where deleted_at is null;
create index if not exists membership_plans_deleted_at_idx on public.membership_plans (deleted_at);
create index if not exists membership_plans_is_active_idx on public.membership_plans (is_active) where is_active = true;

drop trigger if exists trg_membership_plans_updated_at on public.membership_plans;
create trigger trg_membership_plans_updated_at
  before update on public.membership_plans
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 10.3 memberships — gói thành viên của từng profile (đăng ký/gia hạn)
--
-- FK profile_id -> ON DELETE CASCADE: xoá tài khoản (kéo theo xoá profile)
-- thì lịch sử membership của tài khoản đó không còn ý nghĩa độc lập.
-- FK plan_id -> ON DELETE RESTRICT: đúng mẫu đã dùng cho articles.author_id
-- — không cho xoá cứng 1 plan đang có membership tham chiếu, buộc dùng
-- membership_plans.deleted_at (soft delete) để "ngừng bán" 1 gói thay vì
-- xoá hẳn, tránh mất lịch sử giao dịch.
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  plan_id             uuid not null references public.membership_plans (id) on delete restrict,
  status              text not null default 'active'
                      check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  started_at          timestamptz not null default now(),
  current_period_end  timestamptz,
  canceled_at         timestamptz,
  provider            text,             -- vd 'stripe', 'momo', 'manual'
  provider_reference  text,             -- id giao dịch/subscription phía provider
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- Quy tắc nghiệp vụ ép ở tầng CSDL: mỗi profile chỉ có TỐI ĐA 1 membership
-- đang ở trạng thái active/trialing tại một thời điểm (partial unique index,
-- không phải UNIQUE thường — vì cho phép nhiều bản ghi lịch sử ở trạng thái
-- khác như canceled/expired).
create unique index if not exists memberships_one_active_per_profile
  on public.memberships (profile_id)
  where status in ('trialing', 'active') and deleted_at is null;

create index if not exists memberships_profile_id_idx on public.memberships (profile_id);
create index if not exists memberships_plan_id_idx on public.memberships (plan_id);
create index if not exists memberships_status_idx on public.memberships (status);
create index if not exists memberships_current_period_end_idx on public.memberships (current_period_end);
create index if not exists memberships_deleted_at_idx on public.memberships (deleted_at);

drop trigger if exists trg_memberships_updated_at on public.memberships;
create trigger trg_memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 10.4 RLS + POLICY cho profiles/membership_plans/memberships
--
-- profiles: người dùng chỉ đọc/sửa được đúng hồ sơ của chính mình
-- (auth.uid() = id). Không có policy cho phép đọc hồ sơ người khác — "User
-- Profile công khai" là tính năng KHÁC, chưa nằm trong phạm vi bước này.
--
-- membership_plans: đọc công khai (bảng giá) cho gói đang active/chưa xoá —
-- cùng mẫu với "Public read categories/series/tags" đã có.
--
-- memberships: người dùng chỉ đọc được đúng membership của chính mình.
-- KHÔNG có policy ghi cho client — tạo/sửa membership phải qua service_role
-- (backend xử lý thanh toán/webhook), đúng nguyên tắc bảo mật-mặc định đã
-- áp dụng cho toàn schema từ Rev 1.
-- ----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.membership_plans enable row level security;
alter table public.memberships      enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Public read active membership plans" on public.membership_plans;
create policy "Public read active membership plans" on public.membership_plans
  for select using (deleted_at is null and is_active = true);

drop policy if exists "Users can view own memberships" on public.memberships;
create policy "Users can view own memberships" on public.memberships
  for select using (auth.uid() = profile_id);

-- ============================================================================
-- HẾT — 10 bảng (7 lõi + 3 Login/Membership), đầy đủ
-- PK/FK/UNIQUE/INDEX/CHECK/DEFAULT/timestamps/trigger/RLS.
-- ============================================================================
