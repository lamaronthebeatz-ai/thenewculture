-- ============================================================================
-- TNC Platform v2.0 — Seed Data
-- Áp dụng sau khi đã chạy database/schema.sql (KHÔNG tạo lại schema ở đây).
--
-- Dữ liệu bám theo hệ thống The New Culture thật (16 Series đúng tên/mã đang
-- dùng trên site tĩnh hiện tại, badge/honor id đúng registry đã có trong
-- Editor Identity System). Authors ngoài "Lamar" (biên tập viên thật duy nhất
-- trong CMS hiện tại) là dữ liệu SEED/TEST giả lập, không phải người thật,
-- dùng để có đủ "nhiều author" cho việc kiểm thử.
--
-- An toàn chạy lại nhiều lần: mọi INSERT dùng ON CONFLICT ... DO NOTHING theo
-- đúng partial unique index của schema (WHERE deleted_at IS NULL).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. AUTHORS (5 biên tập viên — nhiều vai trò khác nhau)
-- ----------------------------------------------------------------------------
insert into public.authors (slug, name, email, avatar_url, bio, role, honor, badges) values
  ('lamar', 'Lamar', 'lamar@thenewculture.vn', '/uploads/3445.png',
   'Founder & Editor-in-Chief của The New Culture. Theo dõi và ghi chép văn hóa hip-hop underground Việt Nam từ những ngày đầu.',
   'editor-in-chief', 'nguoi-sang-lap',
   '["nguoi-dong-sang-lap","chuyen-gia-hip-hop","dao-duc-bao-chi","cay-but-noi-bat","dai-su-cong-dong"]'::jsonb),

  ('mai-tran', 'Mai Trần', 'mai.tran@thenewculture.vn', null,
   'Phó Tổng Biên tập, phụ trách mảng văn hóa và nghiên cứu chuyên sâu.',
   'deputy-editor', null,
   '["dao-duc-bao-chi","chuyen-gia-van-hoa"]'::jsonb),

  ('duc-anh', 'Đức Anh', 'duc.anh@thenewculture.vn', null,
   'Biên tập viên Âm nhạc cao cấp, chuyên đánh giá album/EP và theo dõi thị trường rap Việt.',
   'senior-editor', null,
   '["chuyen-gia-hip-hop","cay-but-noi-bat"]'::jsonb),

  ('thu-ha', 'Thu Hà', 'thu.ha@thenewculture.vn', null,
   'Biên tập viên phụ trách phỏng vấn và tuyển chọn nội dung nghe hàng tuần.',
   'editor', null,
   '["dieu-tra-chuyen-sau"]'::jsonb),

  ('minh-khoi', 'Minh Khôi', 'minh.khoi@thenewculture.vn', null,
   'Cộng tác viên mới gia nhập, phụ trách hậu trường và nội dung cộng đồng.',
   'contributor', null,
   '[]'::jsonb)
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES (8 — theo đúng các mảng chuyên môn đã có trong Editor
--    Identity System của TNC: Âm nhạc/Văn hóa/Tin tức/Đánh giá/Phỏng vấn/
--    Nghiên cứu/Hình ảnh/Cộng đồng)
-- ----------------------------------------------------------------------------
insert into public.categories (slug, name, description, sort_order) values
  ('am-nhac',   'Âm nhạc',   'Album, EP, single và các phân tích âm nhạc.', 1),
  ('van-hoa',   'Văn hóa',   'Văn hóa hip-hop, đường phố, lifestyle underground.', 2),
  ('tin-tuc',   'Tin tức',   'Cập nhật sự kiện, thông báo, hoạt động mới.', 3),
  ('danh-gia',  'Đánh giá',  'Review album, EP, concert, sản phẩm âm nhạc.', 4),
  ('phong-van', 'Phỏng vấn', 'Phỏng vấn nghệ sĩ, producer, người trong ngành.', 5),
  ('nghien-cuu','Nghiên cứu','Điều tra, phân tích chuyên sâu về ngành công nghiệp.', 6),
  ('hinh-anh',  'Hình ảnh',  'Bộ ảnh, photo essay, nội dung trực quan.', 7),
  ('cong-dong', 'Cộng đồng', 'Hoạt động cộng đồng, hậu trường, sự kiện TNC.', 8)
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 3. SERIES (đúng 16 series hiện có trên site The New Culture)
-- ----------------------------------------------------------------------------
insert into public.series (slug, code, name, description, accent_color, sort_order) values
  ('tnc-origins',         'TNC·01', 'TNC Origins',
   'Những con người, tập thể và cột mốc đặt nền móng cho underground Việt Nam.', 'red', 1),
  ('tnc-profiles',        'TNC·02', 'TNC Profiles',
   'Hồ sơ chi tiết về nghệ sĩ, producer, label, collective và các nhân vật trong ngành.', 'gold', 2),
  ('tnc-records',         'TNC·03', 'TNC Records',
   'Phân tích và lưu trữ những album, EP, mixtape có giá trị.', 'red', 3),
  ('tnc-tracks',          'TNC·04', 'TNC Tracks',
   'Phân tích các ca khúc nổi bật, từ âm nhạc, ca từ đến bối cảnh ra đời và sức ảnh hưởng.', 'gold', 4),
  ('tnc-breakdown',       'TNC·05', 'TNC Breakdown',
   'Phân tích chuyên sâu về hiện tượng, xu hướng, sản phẩm và các vấn đề trong công nghiệp âm nhạc.', 'red', 5),
  ('tnc-editorial',       'TNC·06', 'TNC Editorial',
   'Góc nhìn, quan điểm và bài bình luận của ban biên tập về những chủ đề đáng quan tâm.', 'gold', 6),
  ('tnc-reviews',         'TNC·07', 'TNC Reviews',
   'Đánh giá album, EP, MV, concert, showcase, festival và các sản phẩm âm nhạc.', 'red', 7),
  ('tnc-timeline',        'TNC·08', 'TNC Timeline',
   'Dòng thời gian về lịch sử underground Việt Nam và các cột mốc quan trọng.', 'gold', 8),
  ('tnc-culture',         'TNC·09', 'TNC Culture',
   'Khai thác văn hóa hip hop và underground: graffiti, DJ, breakdance, thời trang, lifestyle, cộng đồng...', 'red', 9),
  ('inside-the-culture',  'TNC·10', 'Inside The Culture',
   'Series phỏng vấn các nghệ sĩ, producer, đạo diễn, photographer, designer, nhà tổ chức và những người đứng sau ngành.', 'gold', 10),
  ('tnc-community',       'TNC·11', 'TNC Community',
   'Phản ánh hoạt động của cộng đồng, sự kiện, workshop, cypher, showcase và các dự án đáng chú ý.', 'red', 11),
  ('tnc-radar',           'TNC·12', 'TNC Radar',
   'Cập nhật những xu hướng, nghệ sĩ, sản phẩm và chuyển động mới trong underground.', 'gold', 12),
  ('tnc-discovery',       'TNC·13', 'TNC Discovery',
   'Giới thiệu những nghệ sĩ, producer, nhóm nhạc, label và dự án mới đầy tiềm năng.', 'red', 13),
  ('tnc-music-101',       'TNC·14', 'TNC Music 101',
   'Chia sẻ kiến thức về rap, hip hop, sản xuất âm nhạc và công nghiệp âm nhạc theo cách dễ tiếp cận.', 'gold', 14),
  ('tnc-selects',         'TNC·15', 'TNC Selects',
   'Tuyển chọn playlist, album, ca khúc và các gợi ý nghe nhạc theo từng chủ đề.', 'red', 15),
  ('behind-the-culture',  'TNC·16', 'Behind The Culture',
   'Hậu trường của The New Culture, quy trình làm báo, hành trình xây dựng tạp chí và những câu chuyện phía sau mỗi bài viết.', 'gold', 16)
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 4. TAGS (18 — trộn giữa tag hệ thống #TNC* và tag chủ đề/nghệ sĩ thật đã
--    xuất hiện trong nội dung TNC)
-- ----------------------------------------------------------------------------
insert into public.tags (slug, name) values
  ('tnc',             '#TNC'),
  ('tnc-origins',     '#TNCOrigins'),
  ('tnc-records',     '#TNCRecords'),
  ('tnc-radar',       '#TNCRadar'),
  ('tnc-breakdown',   '#TNCBreakdown'),
  ('tnc-editorial',   '#TNCEditorial'),
  ('tnc-community',   '#TNCCommunity'),
  ('tnc-music-101',   '#TNCMusic101'),
  ('hip-hop',         '#HipHop'),
  ('viet-nam',        '#VietNam'),
  ('binz',            '#Binz'),
  ('kimmese',         '#Kimmese'),
  ('viet-dragon',     '#VietDragon'),
  ('gvr',             '#GVR'),
  ('dsk',             '#DSK'),
  ('southside',       '#Southside'),
  ('northside',       '#Northside'),
  ('amapiano',        '#Amapiano')
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 5. ARTICLES (11 bài — trải đều 5 trạng thái: draft/review/scheduled/
--    published/archived; nhiều author, nhiều series/category)
-- ----------------------------------------------------------------------------

-- 5.1 PUBLISHED (3 bài)
insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, published_at
)
select 'gvr-ky-uc-cua-mot-the-he-rap-viet',
  'GVR - Ký ức của một thế hệ rap Việt',
  'Nhìn lại hành trình của GVR và dấu ấn để lại trong lòng người nghe rap Việt.',
  'Nội dung đầy đủ của bài viết về GVR...',
  '/uploads/seed-gvr-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'published', true, true, 6, now() - interval '8 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'lamar' and s.slug = 'tnc-origins' and c.slug = 'van-hoa'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, published_at
)
select 'dsk-khi-dua-con-cua-mat-troi-cat-tieng',
  'DSK: Khi "đứa con của mặt trời" cất tiếng',
  'Chân dung DSK và hành trình âm nhạc mang đậm dấu ấn cá nhân.',
  'Nội dung đầy đủ của bài viết về DSK...',
  '/uploads/seed-dsk-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'published', true, false, 5, now() - interval '9 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'lamar' and s.slug = 'tnc-origins' and c.slug = 'am-nhac'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes, published_at
)
select 'amapiano-xu-huong-toan-cau-hay-mot-con-song-ngan',
  'Amapiano: Xu hướng toàn cầu hay chỉ là một cơn sóng ngắn tại Việt Nam?',
  'Nhìn nhận khách quan về sức sống của Amapiano trong thị trường nhạc Việt.',
  'Nội dung đầy đủ của bài viết về Amapiano...',
  '/uploads/seed-amapiano-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'published', 7, now() - interval '10 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'mai-tran' and s.slug = 'tnc-editorial' and c.slug = 'nghien-cuu'
on conflict (slug) where deleted_at is null do nothing;

-- 5.2 ARCHIVED (2 bài — từng published, nay đã lưu trữ)
insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes, published_at
)
select 'kimmese-cong-bo-concert-solo-dau-tien',
  'Kimmese công bố concert solo đầu tiên sau hơn 20 năm hoạt động',
  'Cột mốc đáng nhớ trong sự nghiệp của Kimmese.',
  'Nội dung đầy đủ của bài viết (đã lưu trữ)...',
  '/uploads/seed-kimmese-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'archived', 4, now() - interval '40 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'duc-anh' and s.slug = 'tnc-radar' and c.slug = 'tin-tuc'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes, published_at
)
select 'pjpo-va-hanh-trinh-131km',
  'PJPO và hành trình "131KM": Bản anh hùng ca của "Đại tướng Miền Tây"',
  'Câu chuyện phía sau dự án 131KM của PJPO.',
  'Nội dung đầy đủ của bài viết (đã lưu trữ)...',
  '/uploads/seed-pjpo-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'archived', 5, now() - interval '35 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'lamar' and s.slug = 'tnc-origins' and c.slug = 'van-hoa'
on conflict (slug) where deleted_at is null do nothing;

-- 5.3 SCHEDULED (2 bài — published_at đặt trong tương lai, chưa public)
insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes, published_at
)
select 'mixtape-thang-8-10-ban-thu-am-dang-chu-y',
  'Mixtape tháng 8: 10 bản thu âm đáng chú ý nhất',
  'Tuyển chọn 10 bản thu âm nổi bật sẽ lên sóng đầu tháng 8.',
  'Nội dung đầy đủ (đang chờ lịch đăng)...',
  '/uploads/seed-mixtape-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'scheduled', 8, now() + interval '3 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'thu-ha' and s.slug = 'tnc-selects' and c.slug = 'am-nhac'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes, published_at
)
select 'phong-van-doc-quyen-g-family',
  'Phỏng vấn độc quyền: Hành trình sản xuất album mới của G Family',
  'G Family chia sẻ về quá trình thực hiện album sắp ra mắt.',
  'Nội dung đầy đủ (đang chờ lịch đăng)...',
  '/uploads/seed-gfamily-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'scheduled', 9, now() + interval '5 days'
from public.authors a, public.series s, public.categories c
where a.slug = 'minh-khoi' and s.slug = 'inside-the-culture' and c.slug = 'phong-van'
on conflict (slug) where deleted_at is null do nothing;

-- 5.4 REVIEW (2 bài — chờ duyệt biên tập, chưa có published_at)
insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes
)
select 'danh-gia-ep-moi-cua-mot-nghe-si-moi-noi',
  'Đánh giá: EP mới của một nghệ sĩ mới nổi',
  'Bản đánh giá chi tiết về EP debut gây chú ý gần đây.',
  'Nội dung đầy đủ (đang chờ duyệt)...',
  '/uploads/seed-ep-review-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'review', 6
from public.authors a, public.series s, public.categories c
where a.slug = 'duc-anh' and s.slug = 'tnc-reviews' and c.slug = 'danh-gia'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes
)
select 'dieu-tra-ban-quyen-am-nhac-rap-viet',
  'Điều tra: Thực trạng bản quyền âm nhạc trong rap Việt',
  'Loạt bài điều tra về vấn đề bản quyền đang gây tranh cãi.',
  'Nội dung đầy đủ (đang chờ duyệt)...',
  '/uploads/seed-copyright-cover.jpg', 'Ảnh minh họa — TNC Archive',
  a.id, s.id, c.id, 'review', 10
from public.authors a, public.series s, public.categories c
where a.slug = 'mai-tran' and s.slug = 'tnc-breakdown' and c.slug = 'nghien-cuu'
on conflict (slug) where deleted_at is null do nothing;

-- 5.5 DRAFT (2 bài — mới tạo, chưa gửi duyệt)
insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes
)
select 'ghi-chep-hau-truong-mot-ngay-tai-studio-tnc',
  'Ghi chép hậu trường: Một ngày tại studio TNC',
  'Nhật ký hậu trường một ngày làm việc tại TNC.',
  'Bản nháp — chưa hoàn thiện...',
  null, null,
  a.id, s.id, c.id, 'draft', 3
from public.authors a, public.series s, public.categories c
where a.slug = 'minh-khoi' and s.slug = 'behind-the-culture' and c.slug = 'cong-dong'
on conflict (slug) where deleted_at is null do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, read_time_minutes
)
select 'bo-anh-duong-pho-va-van-hoa-graffiti-sai-gon',
  'Bộ ảnh: Đường phố và văn hóa graffiti Sài Gòn',
  'Photo essay ghi lại các mảng tường graffiti tiêu biểu.',
  'Bản nháp — chưa hoàn thiện...',
  null, null,
  a.id, s.id, c.id, 'draft', 4
from public.authors a, public.series s, public.categories c
where a.slug = 'thu-ha' and s.slug = 'tnc-culture' and c.slug = 'hinh-anh'
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 6. ARTICLE_TAGS (gắn 2-4 tag/bài)
-- ----------------------------------------------------------------------------
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'gvr-ky-uc-cua-mot-the-he-rap-viet' and t.slug in ('tnc', 'tnc-origins', 'gvr', 'hip-hop')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'dsk-khi-dua-con-cua-mat-troi-cat-tieng' and t.slug in ('tnc', 'tnc-origins', 'dsk')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'amapiano-xu-huong-toan-cau-hay-mot-con-song-ngan' and t.slug in ('tnc', 'tnc-editorial', 'amapiano', 'viet-nam')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'kimmese-cong-bo-concert-solo-dau-tien' and t.slug in ('tnc', 'tnc-radar', 'kimmese')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'pjpo-va-hanh-trinh-131km' and t.slug in ('tnc', 'tnc-origins', 'hip-hop')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'mixtape-thang-8-10-ban-thu-am-dang-chu-y' and t.slug in ('tnc', 'hip-hop', 'viet-nam')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'phong-van-doc-quyen-g-family' and t.slug in ('tnc', 'tnc-community', 'southside', 'northside')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'danh-gia-ep-moi-cua-mot-nghe-si-moi-noi' and t.slug in ('tnc', 'hip-hop')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'dieu-tra-ban-quyen-am-nhac-rap-viet' and t.slug in ('tnc', 'tnc-breakdown', 'viet-nam')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'ghi-chep-hau-truong-mot-ngay-tai-studio-tnc' and t.slug in ('tnc', 'tnc-community')
on conflict (article_id, tag_id) do nothing;

insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'bo-anh-duong-pho-va-van-hoa-graffiti-sai-gon' and t.slug in ('tnc', 'viet-nam')
on conflict (article_id, tag_id) do nothing;

-- ----------------------------------------------------------------------------
-- 7. MEDIA (ảnh cover liên kết đúng với từng bài + người upload)
-- ----------------------------------------------------------------------------
insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-gvr-cover.jpg', 'image', 'Ảnh bìa bài GVR', 1600, 900, 245000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'lamar' and art.slug = 'gvr-ky-uc-cua-mot-the-he-rap-viet'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-dsk-cover.jpg', 'image', 'Ảnh bìa bài DSK', 1600, 900, 238000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'lamar' and art.slug = 'dsk-khi-dua-con-cua-mat-troi-cat-tieng'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-amapiano-cover.jpg', 'image', 'Ảnh bìa bài Amapiano', 1600, 900, 251000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'mai-tran' and art.slug = 'amapiano-xu-huong-toan-cau-hay-mot-con-song-ngan'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-kimmese-cover.jpg', 'image', 'Ảnh bìa bài Kimmese', 1600, 900, 229000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'duc-anh' and art.slug = 'kimmese-cong-bo-concert-solo-dau-tien'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-pjpo-cover.jpg', 'image', 'Ảnh bìa bài PJPO', 1600, 900, 233000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'lamar' and art.slug = 'pjpo-va-hanh-trinh-131km'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-mixtape-cover.gif', 'gif', 'GIF động cho mixtape tháng 8', 1200, 675, 4200000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'thu-ha' and art.slug = 'mixtape-thang-8-10-ban-thu-am-dang-chu-y'
on conflict (url) where deleted_at is null do nothing;

insert into public.media (url, type, alt_text, width, height, size_bytes, uploaded_by, article_id)
select '/uploads/seed-gfamily-cover.jpg', 'image', 'Ảnh bìa phỏng vấn G Family', 1600, 900, 241000, a.id, art.id
from public.authors a, public.articles art
where a.slug = 'minh-khoi' and art.slug = 'phong-van-doc-quyen-g-family'
on conflict (url) where deleted_at is null do nothing;

commit;
