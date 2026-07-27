-- ============================================================================
-- TNC Platform v2.0 — Test Suite
-- Chạy SAU khi đã có: database/schema.sql rồi database/seed.sql.
--
-- PHẦN A: kiểm tra tính hợp lý của dữ liệu seed (chỉ đọc, không sửa gì).
-- PHẦN B: kiểm tra cơ chế ràng buộc của schema — FK, UNIQUE, CHECK,
--         Soft Delete, Cascade/Restrict, Trigger updated_at, Partial Unique
--         Index, RLS — bằng dữ liệu tạm (slug bắt đầu "zz-test-"), toàn bộ
--         nằm trong 1 transaction ROLLBACK ở cuối. Không để lại dấu vết,
--         không đụng tới dữ liệu seed, có thể chạy lại bao nhiêu lần cũng
--         được.
--
-- Cách đọc kết quả: mỗi dòng "NOTICE: PASS: ..." là một khẳng định đã đúng.
-- Nếu có bug, script dừng ngay tại dòng lỗi với "ERROR: FAIL: ..." — sửa
-- seed.sql/schema rồi chạy lại từ đầu (schema.sql -> seed.sql -> test.sql).
-- ============================================================================

-- Hàm khẳng định dùng chung, sống trong pg_temp (tự dọn khi ngắt kết nối,
-- không để lại object nào trong schema public).
create or replace function pg_temp.test_assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition then
    raise notice 'PASS: %', label;
  else
    raise exception 'FAIL: %', label;
  end if;
end;
$$;

-- ============================================================================
-- PHẦN A — KIỂM TRA DỮ LIỆU SEED (read-only)
-- ============================================================================
do $$
declare
  cnt int;
begin
  select count(*) into cnt from public.authors where deleted_at is null;
  perform pg_temp.test_assert(cnt >= 5, format('seed: có ít nhất 5 authors (đang có %s)', cnt));

  select count(distinct role) into cnt from public.authors where deleted_at is null;
  perform pg_temp.test_assert(cnt >= 3, format('seed: authors có nhiều role khác nhau (đang có %s)', cnt));

  select count(*) into cnt from public.categories where deleted_at is null;
  perform pg_temp.test_assert(cnt = 8, format('seed: đủ 8 categories (đang có %s)', cnt));

  select count(*) into cnt from public.series where deleted_at is null;
  perform pg_temp.test_assert(cnt = 16, format('seed: đủ 16 series (đang có %s)', cnt));

  select count(*) into cnt from public.tags where deleted_at is null;
  perform pg_temp.test_assert(cnt >= 15, format('seed: có nhiều tag (đang có %s)', cnt));

  select count(*) into cnt from public.media where deleted_at is null;
  perform pg_temp.test_assert(cnt >= 5, format('seed: có media liên kết bài viết (đang có %s)', cnt));

  select count(*) into cnt from public.articles where status = 'draft' and deleted_at is null;
  perform pg_temp.test_assert(cnt >= 1, 'seed: có bài trạng thái draft');
  select count(*) into cnt from public.articles where status = 'review' and deleted_at is null;
  perform pg_temp.test_assert(cnt >= 1, 'seed: có bài trạng thái review');
  select count(*) into cnt from public.articles where status = 'scheduled' and deleted_at is null;
  perform pg_temp.test_assert(cnt >= 1, 'seed: có bài trạng thái scheduled');
  select count(*) into cnt from public.articles where status = 'published' and deleted_at is null;
  perform pg_temp.test_assert(cnt >= 1, 'seed: có bài trạng thái published');
  select count(*) into cnt from public.articles where status = 'archived' and deleted_at is null;
  perform pg_temp.test_assert(cnt >= 1, 'seed: có bài trạng thái archived');

  select count(*) into cnt from public.articles art
    left join public.authors a on a.id = art.author_id
    where art.deleted_at is null and a.id is null;
  perform pg_temp.test_assert(cnt = 0, 'seed: không có article orphan (author_id không hợp lệ)');

  select count(*) into cnt from public.articles
    where status in ('published', 'scheduled') and published_at is null and deleted_at is null;
  perform pg_temp.test_assert(cnt = 0, 'seed: mọi bài published/scheduled đều có published_at');

  select count(*) into cnt from public.article_tags at
    left join public.articles art on art.id = at.article_id
    left join public.tags t on t.id = at.tag_id
    where art.id is null or t.id is null;
  perform pg_temp.test_assert(cnt = 0, 'seed: article_tags không có tham chiếu treo (orphan)');

  select count(*) into cnt from public.media m
    where m.article_id is not null
      and not exists (select 1 from public.articles art where art.id = m.article_id);
  perform pg_temp.test_assert(cnt = 0, 'seed: mọi media.article_id trỏ đúng article còn tồn tại');
end $$;

-- ============================================================================
-- PHẦN B — KIỂM TRA CƠ CHẾ RÀNG BUỘC (dữ liệu tạm, tự rollback)
-- ============================================================================
begin;

-- B1. FOREIGN KEY --------------------------------------------------------------
do $$
begin
  begin
    insert into public.articles (slug, title, author_id, status)
    values ('zz-test-fk-bad-author', 'FK Test', '00000000-0000-0000-0000-000000000000', 'draft');
    perform pg_temp.test_assert(false, 'FK: author_id không tồn tại phải bị từ chối');
  exception when foreign_key_violation then
    perform pg_temp.test_assert(true, 'FK: articles.author_id không hợp lệ bị từ chối đúng');
  end;
end $$;

-- B2. UNIQUE (partial, theo slug còn hiệu lực) ---------------------------------
do $$
begin
  begin
    insert into public.categories (slug, name) values ('am-nhac', 'Âm nhạc trùng');
    perform pg_temp.test_assert(false, 'UNIQUE: category.slug trùng với bản ghi đang hoạt động phải bị từ chối');
  exception when unique_violation then
    perform pg_temp.test_assert(true, 'UNIQUE: category.slug trùng (còn hoạt động) bị từ chối đúng');
  end;
end $$;

-- B3. CHECK CONSTRAINT ----------------------------------------------------------
do $$
declare
  v_author uuid;
begin
  select id into v_author from public.authors where slug = 'lamar';

  begin
    insert into public.articles (slug, title, author_id, status)
    values ('zz-test-check-bad-status', 'Check Test', v_author, 'not-a-real-status');
    perform pg_temp.test_assert(false, 'CHECK: status ngoài enum phải bị từ chối');
  exception when check_violation then
    perform pg_temp.test_assert(true, 'CHECK: articles.status ngoài enum bị từ chối đúng');
  end;

  begin
    insert into public.articles (slug, title, author_id, status)
    values ('zz-test-check-published-no-date', 'Check Test 2', v_author, 'published');
    perform pg_temp.test_assert(false, 'CHECK: published thiếu published_at phải bị từ chối');
  exception when check_violation then
    perform pg_temp.test_assert(true, 'CHECK: published thiếu published_at bị từ chối đúng');
  end;

  begin
    insert into public.media (url, type) values ('/uploads/zz-test.bad', 'not-a-real-type');
    perform pg_temp.test_assert(false, 'CHECK: media.type ngoài enum phải bị từ chối');
  exception when check_violation then
    perform pg_temp.test_assert(true, 'CHECK: media.type ngoài enum bị từ chối đúng');
  end;

  begin
    insert into public.authors (slug, name, email) values ('zz-test-bad-email', 'Test', 'khong-phai-email');
    perform pg_temp.test_assert(false, 'CHECK: email sai định dạng phải bị từ chối');
  exception when check_violation then
    perform pg_temp.test_assert(true, 'CHECK: authors.email sai định dạng bị từ chối đúng');
  end;
end $$;

-- B4. SOFT DELETE + PARTIAL UNIQUE INDEX ----------------------------------------
do $$
declare
  v_id uuid;
begin
  insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTest') returning id into v_id;

  update public.tags set deleted_at = now() where id = v_id;
  perform pg_temp.test_assert(
    (select deleted_at is not null from public.tags where id = v_id),
    'SOFT DELETE: deleted_at được set khi xoá mềm'
  );
  perform pg_temp.test_assert(
    (select count(*) from public.tags where slug = 'zz-test-tag') = 1,
    'SOFT DELETE: row vẫn tồn tại vật lý sau khi soft-delete (không DELETE thật)'
  );

  -- Tái sử dụng đúng slug đó cho 1 row MỚI -> phải thành công nhờ partial unique index
  insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTestMoi');
  perform pg_temp.test_assert(
    (select count(*) from public.tags where slug = 'zz-test-tag') = 2,
    'PARTIAL UNIQUE INDEX: tái sử dụng slug sau soft-delete thành công'
  );

  -- Tạo thêm 1 row ACTIVE thứ 2 cùng slug (khi đã có 1 active) phải bị từ chối
  begin
    insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTestTrung');
    perform pg_temp.test_assert(false, 'PARTIAL UNIQUE INDEX: 2 row active cùng slug phải bị từ chối');
  exception when unique_violation then
    perform pg_temp.test_assert(true, 'PARTIAL UNIQUE INDEX: chỉ cho phép 1 row active/slug — đúng');
  end;
end $$;

-- B5. CASCADE / RESTRICT ---------------------------------------------------------
do $$
declare
  v_author   uuid;
  v_series   uuid;
  v_category uuid;
  v_tag      uuid;
  v_article  uuid;
begin
  select id into v_author   from public.authors    where slug = 'lamar';
  select id into v_series   from public.series      where slug = 'tnc-origins';
  select id into v_category from public.categories  where slug = 'van-hoa';
  select id into v_tag      from public.tags        where slug = 'tnc';

  insert into public.articles (slug, title, author_id, series_id, category_id, status)
  values ('zz-test-cascade-article', 'Cascade Test', v_author, v_series, v_category, 'draft')
  returning id into v_article;

  insert into public.article_tags (article_id, tag_id) values (v_article, v_tag);

  -- RESTRICT: xoá author đang có bài viết phải bị từ chối
  begin
    delete from public.authors where id = v_author;
    perform pg_temp.test_assert(false, 'RESTRICT: xoá author đang có bài viết phải bị từ chối');
  exception when foreign_key_violation then
    perform pg_temp.test_assert(true, 'RESTRICT: authors đang được articles tham chiếu -> chặn xoá đúng');
  end;

  -- SET NULL: xoá series/category phải set null trên article, KHÔNG xoá article
  delete from public.series where id = v_series;
  perform pg_temp.test_assert(
    (select series_id is null from public.articles where id = v_article),
    'ON DELETE SET NULL: xoá series -> articles.series_id chuyển null, article vẫn còn'
  );

  delete from public.categories where id = v_category;
  perform pg_temp.test_assert(
    (select category_id is null from public.articles where id = v_article),
    'ON DELETE SET NULL: xoá category -> articles.category_id chuyển null, article vẫn còn'
  );

  -- CASCADE: xoá article phải tự xoá article_tags liên quan
  perform pg_temp.test_assert(
    (select count(*) from public.article_tags where article_id = v_article) = 1,
    'CASCADE (trước khi xoá): article_tags của article test đang tồn tại'
  );
  delete from public.articles where id = v_article;
  perform pg_temp.test_assert(
    (select count(*) from public.article_tags where article_id = v_article) = 0,
    'ON DELETE CASCADE: xoá article -> article_tags liên quan bị xoá theo'
  );
end $$;

rollback;

-- B6. TRIGGER updated_at -----------------------------------------------------------
-- QUAN TRỌNG: trong Postgres, now() trả về THỜI ĐIỂM BẮT ĐẦU TRANSACTION
-- (transaction_timestamp()), không đổi trong suốt 1 transaction. Vì vậy test
-- này KHÔNG được đặt trong 1 transaction bao trùm như B1-B5/B7 (nếu insert
-- và update cùng 1 transaction, trigger sẽ gán updated_at = now() giống hệt
-- created_at, không thể quan sát được sự thay đổi). Chạy autocommit (mỗi
-- lệnh 1 transaction riêng), rồi tự dọn bằng DELETE thật ở cuối — dữ liệu
-- test không tham chiếu tới bảng nào khác nên xoá thẳng không vi phạm ràng
-- buộc nào.
do $$
declare
  v_id       uuid;
  v_created  timestamptz;
  v_updated_before timestamptz;
begin
  insert into public.tags (slug, name) values ('zz-test-trigger-tag', '#ZZTrigger')
  returning id, created_at, updated_at into v_id, v_created, v_updated_before;
  perform pg_temp.test_assert(v_created = v_updated_before, 'TRIGGER: lúc mới tạo, created_at = updated_at');
end $$;

select pg_sleep(0.05);

do $$
declare
  v_updated_after timestamptz;
  v_created       timestamptz;
  v_updated_before timestamptz;
begin
  select created_at, updated_at into v_created, v_updated_before
    from public.tags where slug = 'zz-test-trigger-tag';

  update public.tags set name = '#ZZTriggerMoi' where slug = 'zz-test-trigger-tag';

  select updated_at into v_updated_after from public.tags where slug = 'zz-test-trigger-tag';

  perform pg_temp.test_assert(v_updated_after > v_updated_before, 'TRIGGER: updated_at tự tăng sau UPDATE');
  perform pg_temp.test_assert(
    (select created_at from public.tags where slug = 'zz-test-trigger-tag') = v_created,
    'TRIGGER: created_at KHÔNG đổi sau UPDATE'
  );
end $$;

delete from public.tags where slug = 'zz-test-trigger-tag';

begin;

-- B7. ROW LEVEL SECURITY --------------------------------------------------------
-- Dùng vai trò tạm không có BYPASSRLS và không phải chủ bảng — superuser/owner
-- mặc định bỏ qua RLS nên KHÔNG dùng để kiểm thử được.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tnc_test_anon') then
    create role tnc_test_anon nologin;
  end if;
  grant usage on schema public to tnc_test_anon;
  grant select on
    public.authors, public.categories, public.series, public.tags,
    public.articles, public.article_tags, public.media
    to tnc_test_anon;
end $$;

do $$
declare
  v_author   uuid;
  v_series   uuid;
  v_category uuid;
  v_draft    uuid;
  v_published uuid;
  cnt_all  int;
  cnt_anon int;
begin
  select id into v_author   from public.authors   where slug = 'lamar';
  select id into v_series   from public.series     where slug = 'tnc-radar'; -- chưa bị xoá ở B5
  select id into v_category from public.categories where slug = 'tin-tuc';   -- chưa bị xoá ở B5

  insert into public.articles (slug, title, author_id, series_id, category_id, status)
  values ('zz-test-rls-draft', 'RLS Draft', v_author, v_series, v_category, 'draft')
  returning id into v_draft;

  insert into public.articles (slug, title, author_id, series_id, category_id, status, published_at)
  values ('zz-test-rls-published', 'RLS Published', v_author, v_series, v_category, 'published', now())
  returning id into v_published;

  select count(*) into cnt_all from public.articles
    where slug in ('zz-test-rls-draft', 'zz-test-rls-published');
  perform pg_temp.test_assert(cnt_all = 2, 'RLS setup: cả 2 bài test (draft + published) đã insert thành công');

  set role tnc_test_anon;
  select count(*) into cnt_anon from public.articles
    where slug in ('zz-test-rls-draft', 'zz-test-rls-published');
  reset role;

  perform pg_temp.test_assert(
    cnt_anon = 1,
    format('RLS: vai trò công khai chỉ thấy bài published (1/2) — đang thấy %s', cnt_anon)
  );
end $$;

rollback;

-- Dọn vai trò test RLS. Bình thường B7 đã bị ROLLBACK cùng cả transaction nên
-- lệnh này chỉ là lưới an toàn (sẽ báo "does not exist, skipping" — không lỗi).
drop role if exists tnc_test_anon;

-- ============================================================================
-- HẾT TEST SUITE — nếu không có dòng "ERROR: FAIL" nào ở trên, mọi ràng buộc
-- và dữ liệu seed đều đúng như thiết kế.
-- ============================================================================
