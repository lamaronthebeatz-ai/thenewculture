-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 4: chuẩn bị schema cho migration
-- Markdown -> Supabase (dữ liệu bài viết/tác giả thật)
--
-- BỐI CẢNH: project Supabase live đã deploy schema.sql và seed.sql thành công
-- trước khi Rev 4 được thêm vào schema.sql. Vì mọi CREATE TABLE trong
-- schema.sql dùng "IF NOT EXISTS", chạy lại schema.sql trên project live sẽ
-- KHÔNG áp dụng 2 thay đổi mới (cột articles.sort_order/poster_image_url,
-- CHECK role mở rộng) — CREATE TABLE IF NOT EXISTS bỏ qua toàn bộ bảng đã
-- tồn tại, kể cả khi định nghĩa cột đã đổi.
--
-- File này là migration ALTER tối thiểu, an toàn để chạy trên project
-- Supabase ĐANG CHẠY THẬT (SQL Editor), tương ứng đúng các thay đổi Rev 4 đã
-- thêm vào schema.sql:
--   1. articles: thêm cột sort_order (default 999), poster_image_url, ranking
--      (jsonb, default '[]' — nuôi khối "Ranking Spotlight" trang chủ)
--   2. authors.role: nới CHECK để chấp nhận thêm 16 role_id tiếng Việt thật
--
-- An toàn để chạy lại nhiều lần (idempotent): dùng ADD COLUMN IF NOT EXISTS,
-- và DROP CONSTRAINT IF EXISTS trước khi ADD CONSTRAINT lại. KHÔNG xoá hay
-- sửa dữ liệu hiện có; cột mới đều có DEFAULT nên các dòng articles cũ tự
-- động nhận sort_order = 999, poster_image_url = NULL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. articles.sort_order — tương ứng "order:" trong frontmatter Markdown
-- ----------------------------------------------------------------------------
alter table public.articles
  add column if not exists sort_order integer not null default 999;

create index if not exists articles_sort_order_idx on public.articles (sort_order);

-- ----------------------------------------------------------------------------
-- 2. articles.poster_image_url — tương ứng "poster:" trong frontmatter
-- ----------------------------------------------------------------------------
alter table public.articles
  add column if not exists poster_image_url text;

-- ----------------------------------------------------------------------------
-- 2b. articles.ranking — tương ứng "ranking:" trong frontmatter, nuôi khối
--     "Ranking Spotlight" trên trang chủ (xem giải thích trong schema.sql).
-- ----------------------------------------------------------------------------
alter table public.articles
  add column if not exists ranking jsonb not null default '[]'::jsonb;

alter table public.articles
  drop constraint if exists articles_ranking_is_array;

alter table public.articles
  add constraint articles_ranking_is_array check (jsonb_typeof(ranking) = 'array');

-- ----------------------------------------------------------------------------
-- 3. authors.role — nới CHECK để chấp nhận thêm 16 role_id tiếng Việt thật
--    (EDITOR_ROLES trong scripts/build.py), giữ nguyên 7 giá trị chung cũ.
-- ----------------------------------------------------------------------------
alter table public.authors
  drop constraint if exists authors_role_check;

alter table public.authors
  add constraint authors_role_check
  check (role in ('editor-in-chief', 'deputy-editor', 'managing-editor',
                   'senior-editor', 'editor', 'contributor', 'guest',
                   'tong-bien-tap', 'pho-tong-bien-tap', 'thu-ky-toa-soan',
                   'truong-ban-bien-tap', 'bien-tap-vien-cao-cap', 'bien-tap-vien',
                   'thuc-tap-bien-tap', 'bien-tap-vien-am-nhac', 'bien-tap-vien-van-hoa',
                   'bien-tap-vien-tin-tuc', 'bien-tap-vien-danh-gia', 'bien-tap-vien-phong-van',
                   'bien-tap-vien-nghien-cuu', 'giam-doc-sang-tao', 'bien-tap-vien-hinh-anh',
                   'cong-tac-vien'));

-- ============================================================================
-- Xác nhận sau khi chạy (không bắt buộc, chỉ để kiểm tra):
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'articles'
--     and column_name in ('sort_order', 'poster_image_url', 'ranking');
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.authors'::regclass and contype = 'c';
-- ============================================================================
