-- ============================================================================
-- TNC Platform v2.0 — Test Suite
-- Chạy SAU khi đã có: database/schema.sql rồi database/seed.sql.
--
-- PHẦN A: kiểm tra tính hợp lý của dữ liệu seed (chỉ đọc, không sửa gì).
-- PHẦN B/C: kiểm tra cơ chế ràng buộc của schema — FK, UNIQUE, CHECK,
--           Soft Delete, Cascade/Restrict, Trigger updated_at, Partial
--           Unique Index, RLS — bằng dữ liệu tạm (slug bắt đầu "zz-test-"),
--           cô lập bằng SAVEPOINT (không phải BEGIN/ROLLBACK riêng — xem lý
--           do ngay dưới đây). Không để lại dấu vết, không đụng tới dữ liệu
--           seed, có thể chạy lại bao nhiêu lần cũng được.
--
-- QUAN TRỌNG — khác biệt với psql chạy cục bộ: Supabase SQL Editor chạy
-- TOÀN BỘ nội dung dán vào như MỘT transaction duy nhất (không tự tách
-- từng câu lệnh thành các transaction autocommit riêng như một kết nối
-- psql thông thường). Hệ quả:
--   1. Không thể dùng nhiều cặp `begin; ... rollback;` độc lập trong cùng
--      1 lần chạy — `begin;` thứ 2 trở đi chỉ là no-op (đã ở trong 1
--      transaction), và `rollback;` sẽ huỷ TOÀN BỘ transaction từ đầu file
--      (kể cả CREATE FUNCTION _tnc_test_assert phía trên!), không chỉ phần
--      dữ liệu tạm vừa chèn. Đây chính là nguyên nhân lỗi
--      "function public._tnc_test_assert(...) does not exist" khi chạy
--      trên Supabase. Thay vào đó, dùng SAVEPOINT/ROLLBACK TO SAVEPOINT —
--      cơ chế duy nhất hoạt động đúng bất kể có đang ở trong 1 transaction
--      bao trùm sẵn hay không, và chỉ huỷ đúng phần sau savepoint đó.
--   2. now() (transaction_timestamp()) đứng yên trong SUỐT quá trình chạy
--      cả file (không chỉ trong 1 khối begin/rollback nhỏ) — nên test
--      trigger `updated_at` KHÔNG thể dựa vào việc so sánh 2 lần gọi now()
--      cách nhau bằng pg_sleep(). Thay vào đó: cố tình gán updated_at về
--      1 mốc cũ cố định ngay trong câu UPDATE, rồi kiểm tra trigger có ép
--      nó về lại "hiện tại" hay không — cách này đúng bất kể now() có trôi
--      giữa các câu lệnh hay không.
--   3. Vai trò chạy SQL Editor trên Supabase Cloud KHÔNG có quyền SET ROLE
--      sang vai trò khác (kể cả "anon"/"authenticated" chuẩn lẫn vai trò tự
--      tạo bằng CREATE ROLE) — báo lỗi "permission denied to set role".
--      Đây là giới hạn bảo mật cố ý của Supabase, không phải lỗi. Vì vậy
--      test.sql KHÔNG dùng SET ROLE/SET LOCAL ROLE/CREATE ROLE ở bất kỳ đâu.
--      RLS được kiểm tra qua CẤU HÌNH (RLS đã bật, policy đúng tên/đúng
--      điều kiện tồn tại — đọc từ pg_class/pg_policies, không cần quyền đặc
--      biệt), KHÔNG kiểm tra HÀNH VI (đăng nhập giả lập rồi xem có bị lọc
--      đúng hay không) — muốn kiểm thử hành vi RLS thật, phải gọi qua
--      Supabase client/REST API bằng JWT thật của user, ngoài phạm vi 1 file
--      .sql chạy trong SQL Editor.
--
-- Cách đọc kết quả: mỗi dòng "NOTICE: PASS: ..." là một khẳng định đã đúng.
-- Nếu có bug, script dừng ngay tại dòng lỗi với "ERROR: FAIL: ..." — sửa
-- seed.sql/schema rồi chạy lại từ đầu (schema.sql -> seed.sql -> test.sql).
-- ============================================================================

begin;

-- Hàm khẳng định dùng chung — một hàm THẬT trong schema public (không phải
-- pg_temp: CREATE FUNCTION nhắm thẳng vào pg_temp không tự khởi tạo được
-- schema tạm của session, gây lỗi "schema pg_temp does not exist" trên
-- Supabase SQL Editor). Được DROP tường minh ở cuối file để không để lại
-- object nào sau khi chạy xong.
create or replace function public._tnc_test_assert(condition boolean, label text)
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
  perform public._tnc_test_assert(cnt >= 5, format('seed: có ít nhất 5 authors (đang có %s)', cnt));

  select count(distinct role) into cnt from public.authors where deleted_at is null;
  perform public._tnc_test_assert(cnt >= 3, format('seed: authors có nhiều role khác nhau (đang có %s)', cnt));

  select count(*) into cnt from public.categories where deleted_at is null;
  perform public._tnc_test_assert(cnt = 8, format('seed: đủ 8 categories (đang có %s)', cnt));

  select count(*) into cnt from public.series where deleted_at is null;
  perform public._tnc_test_assert(cnt = 16, format('seed: đủ 16 series (đang có %s)', cnt));

  select count(*) into cnt from public.tags where deleted_at is null;
  perform public._tnc_test_assert(cnt >= 15, format('seed: có nhiều tag (đang có %s)', cnt));

  select count(*) into cnt from public.media where deleted_at is null;
  perform public._tnc_test_assert(cnt >= 5, format('seed: có media liên kết bài viết (đang có %s)', cnt));

  select count(*) into cnt from public.articles where status = 'draft' and deleted_at is null;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có bài trạng thái draft');
  select count(*) into cnt from public.articles where status = 'review' and deleted_at is null;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có bài trạng thái review');
  select count(*) into cnt from public.articles where status = 'scheduled' and deleted_at is null;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có bài trạng thái scheduled');
  select count(*) into cnt from public.articles where status = 'published' and deleted_at is null;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có bài trạng thái published');
  select count(*) into cnt from public.articles where status = 'archived' and deleted_at is null;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có bài trạng thái archived');

  select count(*) into cnt from public.articles art
    left join public.authors a on a.id = art.author_id
    where art.deleted_at is null and a.id is null;
  perform public._tnc_test_assert(cnt = 0, 'seed: không có article orphan (author_id không hợp lệ)');

  select count(*) into cnt from public.articles
    where status in ('published', 'scheduled') and published_at is null and deleted_at is null;
  perform public._tnc_test_assert(cnt = 0, 'seed: mọi bài published/scheduled đều có published_at');

  select count(*) into cnt from public.article_tags at
    left join public.articles art on art.id = at.article_id
    left join public.tags t on t.id = at.tag_id
    where art.id is null or t.id is null;
  perform public._tnc_test_assert(cnt = 0, 'seed: article_tags không có tham chiếu treo (orphan)');

  select count(*) into cnt from public.media m
    where m.article_id is not null
      and not exists (select 1 from public.articles art where art.id = m.article_id);
  perform public._tnc_test_assert(cnt = 0, 'seed: mọi media.article_id trỏ đúng article còn tồn tại');
end $$;

-- Login + Membership: membership_plans luôn có (không phụ thuộc auth.users).
-- profiles/memberships tuỳ thuộc project đã có user đăng ký thật hay chưa —
-- SKIP an toàn (không FAIL) khi chưa có ai đăng ký, đúng như thiết kế seed.sql.
do $$
declare
  cnt int;
  profile_cnt int;
begin
  select count(*) into cnt from public.membership_plans where deleted_at is null;
  perform public._tnc_test_assert(cnt = 3, format('seed: đủ 3 membership_plans (đang có %s)', cnt));

  select count(*) into cnt from public.membership_plans where deleted_at is null and is_active = true;
  perform public._tnc_test_assert(cnt >= 1, 'seed: có ít nhất 1 membership_plan đang active');

  select count(*) into profile_cnt from public.profiles;
  if profile_cnt = 0 then
    raise notice 'SKIP: chưa có profiles nào (auth.users rỗng) — bỏ qua kiểm tra seed profiles/memberships; đây là trạng thái hợp lệ trên project Supabase chưa có ai đăng ký.';
  else
    select count(*) into cnt from public.memberships m
      left join public.profiles p on p.id = m.profile_id
      left join public.membership_plans mp on mp.id = m.plan_id
      where p.id is null or mp.id is null;
    perform public._tnc_test_assert(cnt = 0, 'seed: mọi membership trỏ đúng profile/plan còn tồn tại');

    select count(*) into cnt from (
      select profile_id from public.memberships
      where status in ('trialing', 'active') and deleted_at is null
      group by profile_id having count(*) > 1
    ) x;
    perform public._tnc_test_assert(cnt = 0, 'seed: không có profile nào có nhiều hơn 1 membership active/trialing cùng lúc');
  end if;
end $$;

-- ============================================================================
-- PHẦN B — KIỂM TRA CƠ CHẾ RÀNG BUỘC CỦA 7 BẢNG LÕI (dữ liệu tạm, cô lập
-- bằng SAVEPOINT — xem giải thích ở đầu file)
-- ============================================================================
savepoint sp_part_b;

-- B1. FOREIGN KEY --------------------------------------------------------------
do $$
begin
  begin
    insert into public.articles (slug, title, author_id, status)
    values ('zz-test-fk-bad-author', 'FK Test', '00000000-0000-0000-0000-000000000000', 'draft');
    perform public._tnc_test_assert(false, 'FK: author_id không tồn tại phải bị từ chối');
  exception when foreign_key_violation then
    perform public._tnc_test_assert(true, 'FK: articles.author_id không hợp lệ bị từ chối đúng');
  end;
end $$;

-- B2. UNIQUE (partial, theo slug còn hiệu lực) ---------------------------------
do $$
begin
  begin
    insert into public.categories (slug, name) values ('am-nhac', 'Âm nhạc trùng');
    perform public._tnc_test_assert(false, 'UNIQUE: category.slug trùng với bản ghi đang hoạt động phải bị từ chối');
  exception when unique_violation then
    perform public._tnc_test_assert(true, 'UNIQUE: category.slug trùng (còn hoạt động) bị từ chối đúng');
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
    perform public._tnc_test_assert(false, 'CHECK: status ngoài enum phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: articles.status ngoài enum bị từ chối đúng');
  end;

  begin
    insert into public.articles (slug, title, author_id, status)
    values ('zz-test-check-published-no-date', 'Check Test 2', v_author, 'published');
    perform public._tnc_test_assert(false, 'CHECK: published thiếu published_at phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: published thiếu published_at bị từ chối đúng');
  end;

  begin
    insert into public.media (url, type) values ('/uploads/zz-test.bad', 'not-a-real-type');
    perform public._tnc_test_assert(false, 'CHECK: media.type ngoài enum phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: media.type ngoài enum bị từ chối đúng');
  end;

  begin
    insert into public.authors (slug, name, email) values ('zz-test-bad-email', 'Test', 'khong-phai-email');
    perform public._tnc_test_assert(false, 'CHECK: email sai định dạng phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: authors.email sai định dạng bị từ chối đúng');
  end;
end $$;

-- B4. SOFT DELETE + PARTIAL UNIQUE INDEX ----------------------------------------
do $$
declare
  v_id uuid;
begin
  insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTest') returning id into v_id;

  update public.tags set deleted_at = now() where id = v_id;
  perform public._tnc_test_assert(
    (select deleted_at is not null from public.tags where id = v_id),
    'SOFT DELETE: deleted_at được set khi xoá mềm'
  );
  perform public._tnc_test_assert(
    (select count(*) from public.tags where slug = 'zz-test-tag') = 1,
    'SOFT DELETE: row vẫn tồn tại vật lý sau khi soft-delete (không DELETE thật)'
  );

  -- Tái sử dụng đúng slug đó cho 1 row MỚI -> phải thành công nhờ partial unique index
  insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTestMoi');
  perform public._tnc_test_assert(
    (select count(*) from public.tags where slug = 'zz-test-tag') = 2,
    'PARTIAL UNIQUE INDEX: tái sử dụng slug sau soft-delete thành công'
  );

  -- Tạo thêm 1 row ACTIVE thứ 2 cùng slug (khi đã có 1 active) phải bị từ chối
  begin
    insert into public.tags (slug, name) values ('zz-test-tag', '#ZZTestTrung');
    perform public._tnc_test_assert(false, 'PARTIAL UNIQUE INDEX: 2 row active cùng slug phải bị từ chối');
  exception when unique_violation then
    perform public._tnc_test_assert(true, 'PARTIAL UNIQUE INDEX: chỉ cho phép 1 row active/slug — đúng');
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
    perform public._tnc_test_assert(false, 'RESTRICT: xoá author đang có bài viết phải bị từ chối');
  exception when foreign_key_violation then
    perform public._tnc_test_assert(true, 'RESTRICT: authors đang được articles tham chiếu -> chặn xoá đúng');
  end;

  -- SET NULL: xoá series/category phải set null trên article, KHÔNG xoá article
  delete from public.series where id = v_series;
  perform public._tnc_test_assert(
    (select series_id is null from public.articles where id = v_article),
    'ON DELETE SET NULL: xoá series -> articles.series_id chuyển null, article vẫn còn'
  );

  delete from public.categories where id = v_category;
  perform public._tnc_test_assert(
    (select category_id is null from public.articles where id = v_article),
    'ON DELETE SET NULL: xoá category -> articles.category_id chuyển null, article vẫn còn'
  );

  -- CASCADE: xoá article phải tự xoá article_tags liên quan
  perform public._tnc_test_assert(
    (select count(*) from public.article_tags where article_id = v_article) = 1,
    'CASCADE (trước khi xoá): article_tags của article test đang tồn tại'
  );
  delete from public.articles where id = v_article;
  perform public._tnc_test_assert(
    (select count(*) from public.article_tags where article_id = v_article) = 0,
    'ON DELETE CASCADE: xoá article -> article_tags liên quan bị xoá theo'
  );
end $$;

-- B6. TRIGGER updated_at ---------------------------------------------------------
-- Cố tình gán updated_at về 1 mốc cũ cố định ngay trong câu UPDATE — trigger
-- (BEFORE UPDATE) phải ép nó về "hiện tại", bất kể client cố gán gì. Cách
-- này không phụ thuộc việc now() có trôi giữa các câu lệnh hay không (xem
-- giải thích ở đầu file), nên đúng cả khi cả script chạy trong 1 transaction
-- duy nhất trên Supabase SQL Editor.
do $$
declare
  v_id      uuid;
  v_created timestamptz;
begin
  insert into public.tags (slug, name) values ('zz-test-trigger-tag', '#ZZTrigger')
  returning id, created_at into v_id, v_created;

  update public.tags
    set name = '#ZZTriggerMoi', updated_at = '2000-01-01T00:00:00Z'
    where id = v_id;

  perform public._tnc_test_assert(
    (select updated_at from public.tags where id = v_id) > '2001-01-01T00:00:00Z'::timestamptz,
    'TRIGGER: updated_at bị trigger ép về hiện tại, không giữ giá trị client cố gán thủ công (2000-01-01)'
  );
  perform public._tnc_test_assert(
    (select created_at from public.tags where id = v_id) = v_created,
    'TRIGGER: created_at KHÔNG đổi sau UPDATE (UPDATE không đề cập tới created_at)'
  );
end $$;

-- B7. ROW LEVEL SECURITY (kiểm tra CẤU HÌNH, không dùng SET ROLE) -----------
-- Trên Supabase Cloud, vai trò chạy SQL Editor không có quyền SET ROLE sang
-- vai trò khác (kể cả "anon"/"authenticated" chuẩn lẫn vai trò tự tạo) —
-- đây là giới hạn bảo mật cố ý của Supabase, không phải lỗi ("permission
-- denied to set role"). Vì vậy KHÔNG kiểm thử HÀNH VI RLS (giả lập đăng
-- nhập rồi xem có bị lọc đúng hay không) trong SQL Editor được — muốn kiểm
-- thử hành vi thật, phải gọi qua Supabase client/REST API bằng JWT thật
-- của user, ngoài phạm vi 1 file .sql. Thay vào đó, kiểm tra đúng CẤU HÌNH
-- RLS đã khai báo trong schema.sql qua catalog hệ thống (pg_class,
-- pg_policies) — chỉ đọc, không cần quyền đặc biệt nào, không tạo/đổi vai
-- trò nào cả.
do $$
declare
  cnt int;
begin
  select count(*) into cnt from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
      and c.relname in ('authors', 'categories', 'series', 'tags', 'articles', 'article_tags', 'media');
  perform public._tnc_test_assert(
    cnt = 7, format('RLS: cả 7 bảng lõi đều đã ENABLE ROW LEVEL SECURITY (đang có %s/7)', cnt)
  );

  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'authors' and policyname = 'Public read active authors'),
    'RLS: policy "Public read active authors" tồn tại trên authors'
  );
  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'Public read categories'),
    'RLS: policy "Public read categories" tồn tại trên categories'
  );
  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'series' and policyname = 'Public read series'),
    'RLS: policy "Public read series" tồn tại trên series'
  );
  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tags' and policyname = 'Public read tags'),
    'RLS: policy "Public read tags" tồn tại trên tags'
  );
  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'articles' and policyname = 'Public read published articles'
        and cmd = 'SELECT' and qual ilike '%published%'
    ),
    'RLS: policy "Public read published articles" tồn tại trên articles, đúng điều kiện lọc theo status published'
  );
  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'article_tags' and policyname = 'Public read article_tags of published articles'),
    'RLS: policy "Public read article_tags of published articles" tồn tại trên article_tags'
  );
  perform public._tnc_test_assert(
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media' and policyname = 'Public read media'),
    'RLS: policy "Public read media" tồn tại trên media'
  );
end $$;

rollback to savepoint sp_part_b;

-- ============================================================================
-- PHẦN C — LOGIN + MEMBERSHIP (Rev 3): profiles / membership_plans / memberships
--
-- Nguyên tắc giống Phần B: dữ liệu tạm ("zz-test-..."), cô lập bằng
-- SAVEPOINT. RIÊNG với profiles: KHÔNG BAO GIỜ insert trực tiếp vào
-- auth.users trong file này — tạo tài khoản là trách nhiệm của Supabase
-- Auth API, không phải seed/test script (insert tay vào auth.users trên
-- project Supabase thật có thể vi phạm ràng buộc nội bộ của GoTrue mà
-- schema.sql không kiểm soát được). Vì vậy mọi test cần 1 profile thật đều
-- dùng PROFILE ĐÃ CÓ SẴN (từ seed.sql hoặc signup thật) và SKIP an toàn
-- (không FAIL) nếu project chưa có ai đăng ký — đúng nguyên tắc đã áp dụng
-- cho seed.sql.
-- ============================================================================
savepoint sp_part_c;

-- C1. FOREIGN KEY: profiles.id phải trỏ auth.users có thật -------------------
do $$
begin
  begin
    insert into public.profiles (id) values ('00000000-0000-0000-0000-000000000000');
    perform public._tnc_test_assert(false, 'FK: profiles.id không tồn tại trong auth.users phải bị từ chối');
  exception when foreign_key_violation then
    perform public._tnc_test_assert(true, 'FK: profiles.id không có trong auth.users bị từ chối đúng');
  end;
end $$;

-- C2. FOREIGN KEY: memberships.profile_id phải trỏ profiles có thật ----------
do $$
declare
  v_plan uuid;
begin
  select id into v_plan from public.membership_plans where slug = 'doc-gia-mien-phi';
  begin
    insert into public.memberships (profile_id, plan_id, status)
    values ('00000000-0000-0000-0000-000000000000', v_plan, 'active');
    perform public._tnc_test_assert(false, 'FK: memberships.profile_id không tồn tại phải bị từ chối');
  exception when foreign_key_violation then
    perform public._tnc_test_assert(true, 'FK: memberships.profile_id không có trong profiles bị từ chối đúng');
  end;
end $$;

-- C3. CHECK CONSTRAINT trên membership_plans (không phụ thuộc auth.users) ----
do $$
begin
  begin
    insert into public.membership_plans (slug, name, price_cents) values ('zz-test-plan-bad-price', 'Bad', -1000);
    perform public._tnc_test_assert(false, 'CHECK: membership_plans.price_cents âm phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: membership_plans.price_cents âm bị từ chối đúng');
  end;

  begin
    insert into public.membership_plans (slug, name, billing_interval) values ('zz-test-plan-bad-interval', 'Bad', 'weekly');
    perform public._tnc_test_assert(false, 'CHECK: membership_plans.billing_interval ngoài enum phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: membership_plans.billing_interval ngoài enum bị từ chối đúng');
  end;

  begin
    insert into public.membership_plans (slug, name, currency) values ('zz-test-plan-bad-currency', 'Bad', 'vnd');
    perform public._tnc_test_assert(false, 'CHECK: membership_plans.currency sai định dạng (chữ thường) phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: membership_plans.currency sai định dạng bị từ chối đúng');
  end;
end $$;

-- C4. SOFT DELETE + PARTIAL UNIQUE INDEX trên membership_plans.slug ----------
do $$
declare
  v_id uuid;
begin
  insert into public.membership_plans (slug, name) values ('zz-test-plan', 'Zz Test Plan') returning id into v_id;
  update public.membership_plans set deleted_at = now() where id = v_id;
  perform public._tnc_test_assert(
    (select count(*) from public.membership_plans where slug = 'zz-test-plan') = 1,
    'SOFT DELETE: membership_plans vẫn còn tồn tại vật lý sau khi soft-delete'
  );

  insert into public.membership_plans (slug, name) values ('zz-test-plan', 'Zz Test Plan Mới');
  perform public._tnc_test_assert(
    (select count(*) from public.membership_plans where slug = 'zz-test-plan') = 2,
    'PARTIAL UNIQUE INDEX: tái sử dụng slug membership_plans sau soft-delete thành công'
  );

  begin
    insert into public.membership_plans (slug, name) values ('zz-test-plan', 'Zz Test Plan Trùng');
    perform public._tnc_test_assert(false, 'PARTIAL UNIQUE INDEX: 2 membership_plans active cùng slug phải bị từ chối');
  exception when unique_violation then
    perform public._tnc_test_assert(true, 'PARTIAL UNIQUE INDEX: chỉ 1 membership_plan active/slug — đúng');
  end;
end $$;

-- C5. TRIGGER updated_at (membership_plans) — cùng kỹ thuật với B6 -----------
do $$
declare
  v_id      uuid;
  v_created timestamptz;
begin
  insert into public.membership_plans (slug, name) values ('zz-test-trigger-plan', 'Zz Trigger Plan')
  returning id, created_at into v_id, v_created;

  update public.membership_plans
    set name = 'Zz Trigger Plan Mới', updated_at = '2000-01-01T00:00:00Z'
    where id = v_id;

  perform public._tnc_test_assert(
    (select updated_at from public.membership_plans where id = v_id) > '2001-01-01T00:00:00Z'::timestamptz,
    'TRIGGER (membership_plans): updated_at bị trigger ép về hiện tại, không giữ giá trị client cố gán thủ công'
  );
  perform public._tnc_test_assert(
    (select created_at from public.membership_plans where id = v_id) = v_created,
    'TRIGGER (membership_plans): created_at KHÔNG đổi sau UPDATE'
  );
end $$;

-- C6-C9: cần 1 profile CÓ THẬT (không tạo giả) — SKIP an toàn nếu project
-- chưa có user nào đăng ký.
do $$
declare
  v_profile    uuid;
  v_plan_free  uuid;
  v_plan_paid  uuid;
  v_membership uuid;
begin
  select id into v_profile from public.profiles order by created_at limit 1;
  if v_profile is null then
    raise notice 'SKIP: chưa có profile thật nào — bỏ qua C6-C9 (RESTRICT/CHECK/Partial-unique/CASCADE liên quan tới 1 profile cụ thể).';
    return;
  end if;

  select id into v_plan_free from public.membership_plans where slug = 'doc-gia-mien-phi';

  -- Tạo 1 plan test riêng để xoá thử (không đụng plan thật đang dùng trong seed)
  insert into public.membership_plans (slug, name) values ('zz-test-restrict-plan', 'Zz Restrict Plan')
  returning id into v_plan_paid;

  insert into public.memberships (profile_id, plan_id, status)
  values (v_profile, v_plan_paid, 'canceled')  -- canceled: không đụng ràng buộc "1 active/profile"
  returning id into v_membership;

  -- C6. RESTRICT: xoá plan đang có membership tham chiếu phải bị chặn
  begin
    delete from public.membership_plans where id = v_plan_paid;
    perform public._tnc_test_assert(false, 'RESTRICT: xoá membership_plan đang có membership tham chiếu phải bị từ chối');
  exception when foreign_key_violation then
    perform public._tnc_test_assert(true, 'RESTRICT: membership_plans đang được memberships tham chiếu -> chặn xoá đúng');
  end;

  -- C7. CHECK: memberships.status ngoài enum
  begin
    update public.memberships set status = 'not-a-real-status' where id = v_membership;
    perform public._tnc_test_assert(false, 'CHECK: memberships.status ngoài enum phải bị từ chối');
  exception when check_violation then
    perform public._tnc_test_assert(true, 'CHECK: memberships.status ngoài enum bị từ chối đúng');
  end;

  -- C8. PARTIAL UNIQUE INDEX: tối đa 1 active/trialing mỗi profile.
  -- Chuyển tạm mọi active/trialing hiện có của profile này sang 'canceled'
  -- (nằm trong savepoint sẽ rollback, không ảnh hưởng dữ liệu thật) để có
  -- trạng thái xác định trước khi test.
  update public.memberships set status = 'canceled'
    where profile_id = v_profile and status in ('trialing', 'active');

  insert into public.memberships (profile_id, plan_id, status) values (v_profile, v_plan_paid, 'active');
  perform public._tnc_test_assert(
    true, 'PARTIAL UNIQUE INDEX (memberships): profile không có active/trialing nào khác -> insert active đầu tiên thành công'
  );

  begin
    insert into public.memberships (profile_id, plan_id, status) values (v_profile, v_plan_free, 'trialing');
    perform public._tnc_test_assert(false, 'PARTIAL UNIQUE INDEX (memberships): thêm active/trialing thứ 2 cho cùng profile phải bị từ chối');
  exception when unique_violation then
    perform public._tnc_test_assert(true, 'PARTIAL UNIQUE INDEX (memberships): chỉ 1 active/trialing / profile — đúng');
  end;

  -- C9. CASCADE: xoá profile -> memberships của profile đó bị xoá theo
  perform public._tnc_test_assert(
    (select count(*) from public.memberships where profile_id = v_profile) > 0,
    'CASCADE (trước khi xoá): profile test đang có ít nhất 1 membership'
  );
  delete from public.profiles where id = v_profile;
  perform public._tnc_test_assert(
    (select count(*) from public.memberships where profile_id = v_profile) = 0,
    'ON DELETE CASCADE: xoá profile -> memberships liên quan bị xoá theo'
  );
end $$;

-- C10. ROW LEVEL SECURITY cho profiles/membership_plans/memberships
-- (kiểm tra CẤU HÌNH, không dùng SET ROLE — lý do xem chú thích ở B7).
do $$
begin
  perform public._tnc_test_assert(
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'profiles'),
    'RLS: profiles đã ENABLE ROW LEVEL SECURITY'
  );
  perform public._tnc_test_assert(
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'membership_plans'),
    'RLS: membership_plans đã ENABLE ROW LEVEL SECURITY'
  );
  perform public._tnc_test_assert(
    (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'memberships'),
    'RLS: memberships đã ENABLE ROW LEVEL SECURITY'
  );

  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can view own profile'
        and cmd = 'SELECT' and qual ilike '%auth.uid()%'
    ),
    'RLS: policy "Users can view own profile" (SELECT, so khớp auth.uid()) tồn tại trên profiles'
  );
  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can insert own profile'
        and cmd = 'INSERT' and with_check ilike '%auth.uid()%'
    ),
    'RLS: policy "Users can insert own profile" (INSERT, so khớp auth.uid()) tồn tại trên profiles'
  );
  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update own profile'
        and cmd = 'UPDATE' and qual ilike '%auth.uid()%' and with_check ilike '%auth.uid()%'
    ),
    'RLS: policy "Users can update own profile" (UPDATE, so khớp auth.uid()) tồn tại trên profiles'
  );
  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'membership_plans' and policyname = 'Public read active membership plans'
        and cmd = 'SELECT' and qual ilike '%is_active%'
    ),
    'RLS: policy "Public read active membership plans" (đọc công khai gói đang active) tồn tại trên membership_plans'
  );
  perform public._tnc_test_assert(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'memberships' and policyname = 'Users can view own memberships'
        and cmd = 'SELECT' and qual ilike '%auth.uid()%'
    ),
    'RLS: policy "Users can view own memberships" (SELECT, so khớp auth.uid()) tồn tại trên memberships'
  );
end $$;

rollback to savepoint sp_part_c;

-- Dọn hàm khẳng định dùng chung — không phải object tạm/session nên phải
-- tự dọn tường minh. An toàn chạy lại nhiều lần: DROP FUNCTION IF EXISTS
-- không lỗi nếu đã dọn.
drop function if exists public._tnc_test_assert(boolean, text);

commit;

-- ============================================================================
-- HẾT TEST SUITE — nếu không có dòng "ERROR: FAIL" nào ở trên, mọi ràng buộc
-- và dữ liệu seed đều đúng như thiết kế.
-- ============================================================================
