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
-- HẾT — 7 bảng, đầy đủ PK/FK/UNIQUE/INDEX/CHECK/DEFAULT/timestamps/RLS.
-- ============================================================================
