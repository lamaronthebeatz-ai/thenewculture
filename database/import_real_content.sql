-- ============================================================================
-- TNC Platform v2.0 — Import nội dung thật (Markdown -> Supabase)
--
-- Sinh TỰ ĐỘNG từ content/articles/*.md (20 bài) + content/editors/lamar.md
-- bằng cùng logic phân tích frontmatter/slug/ngày/ranking mà scripts/build.py
-- dùng để đọc Markdown — đảm bảo dữ liệu chuyển sang Supabase khớp với
-- những gì site đang hiển thị hiện tại.
--
-- YÊU CẦU CHẠY TRƯỚC: schema.sql (+ migrate_rev4_real_content.sql nếu project
-- đã deploy trước Rev 4) và seed.sql (cần có sẵn author 'lamar', 16 series).
-- An toàn chạy lại nhiều lần: articles/tags dùng ON CONFLICT DO NOTHING;
-- profile Lamar dùng UPDATE (ghi đè đúng giá trị thật, không nhân bản).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cập nhật hồ sơ THẬT của Lamar (seed.sql trước đó chỉ có placeholder demo)
-- ----------------------------------------------------------------------------
update public.authors set
  avatar_url = '/uploads/3445.png',
  bio        = $t1$Founder & Editor-in-Chief của The New Culture. Theo dõi và ghi chép văn hóa hip-hop underground Việt Nam từ những ngày đầu.$t1$,
  role       = 'tong-bien-tap',
  honor      = 'nguoi-sang-lap',
  badges     = '["kien-truc-nen-tang", "chuyen-gia-hip-hop", "dai-su-cong-dong"]'::jsonb
where slug = 'lamar';

-- ----------------------------------------------------------------------------
-- 2. Author bổ sung: 2 bài viết thật dùng byline không phải "Lamar" (author
--    là free-text trong Markdown, nhưng articles.author_id trong Supabase
--    BẮT BUỘC trỏ tới 1 authors.id có thật) — tạo 2 author "bút danh toà
--    soạn" tương ứng, role chung 'editor' (không cần role_id riêng).
-- ----------------------------------------------------------------------------
insert into public.authors (slug, name, role)
values
  ('tnc-editorial', 'TNC Editorial', 'editor'),
  ('tnc-selectas', 'TNC SELECTAS', 'editor')
on conflict (slug) where deleted_at is null do nothing;

-- ----------------------------------------------------------------------------
-- 3. Tags thật dùng trong 20 bài viết. Một vài tag demo trong seed.sql (vd
--    '#TNCOrigins') được đặt slug đẹp có gạch nối tay ('tnc-origins'), nhưng
--    slugify() thật trong scripts/build.py (áp lên đúng hashtag liền không
--    dấu cách) lại sinh ra slug KHÔNG gạch nối ('tncorigins') — đây mới là
--    slug đang chạy thật trên site hiện tại. Vì UNIQUE(name) không cho phép
--    2 tag trùng tên hiển thị, ta KHÔNG chèn thêm bản trùng tên; thay vào đó
--    tái sử dụng đúng tag đã có (join theo name) và sửa lại đúng slug thật
--    của nó — giữ đúng URL trang tag hiện đang chạy, không tạo tag ảo.
-- ----------------------------------------------------------------------------
insert into public.tags (slug, name)
select v.slug, v.name from (values

  ('131km', '#131km'),
  ('24k-right', '#24k.right'),
  ('5ber1', '#5BER1'),
  ('album', '#Album'),
  ('amapiano', '#Amapiano'),
  ('andreerighthand', '#Andreerighthand'),
  ('back2daculture', '#Back2daculture'),
  ('binz', '#Binz'),
  ('dasunkid', '#Dasunkid'),
  ('defjam', '#Defjam'),
  ('dsk', '#DSK'),
  ('evnets', '#Evnets'),
  ('forme-se', '#ForMe''se'),
  ('freaky', '#Freaky'),
  ('gaplai', '#Gaplai'),
  ('gfamily', '#Gfamily'),
  ('gvr', '#GVR'),
  ('hanhor', '#HanhOr'),
  ('justatee', '#Justatee'),
  ('kewtiie', '#Kewtiie'),
  ('kimmese', '#Kimmese'),
  ('kosmik', '#Kosmik'),
  ('kts2026', '#KTS2026'),
  ('ladykillah', '#Ladykillah'),
  ('lamar', '#Lamar'),
  ('lk', '#LK'),
  ('northside', '#Northside'),
  ('pjpo', '#Pjpo'),
  ('producer', '#Producer'),
  ('records', '#Records'),
  ('rockycde', '#RockyCDE'),
  ('southside', '#Southside'),
  ('spacespeakers', '#Spacespeakers'),
  ('tnc', '#TNC'),
  ('tncbreakdown', '#TNCBreakdown'),
  ('tnccommunity', '#TNCCommunity'),
  ('tnceditorial', '#TNCEditorial'),
  ('tncmusic101', '#TNCMusic101'),
  ('tncorigins', '#TNCOrigins'),
  ('tncradar', '#TNCRadar'),
  ('tncrecords', '#TNCRecords'),
  ('tncreview', '#TNCReview'),
  ('tncselects', '#TNCSELECTS'),
  ('vietdragon', '#Vietdragon'),
  ('vietdragon-tncorigins-lamar', '#Vietdragon #TNCOrigins #Lamar')

) as v(slug, name)
where not exists (
  select 1 from public.tags existing
  where existing.name = v.name and existing.deleted_at is null
);

update public.tags set slug = v.slug
from (values

  ('131km', '#131km'),
  ('24k-right', '#24k.right'),
  ('5ber1', '#5BER1'),
  ('album', '#Album'),
  ('amapiano', '#Amapiano'),
  ('andreerighthand', '#Andreerighthand'),
  ('back2daculture', '#Back2daculture'),
  ('binz', '#Binz'),
  ('dasunkid', '#Dasunkid'),
  ('defjam', '#Defjam'),
  ('dsk', '#DSK'),
  ('evnets', '#Evnets'),
  ('forme-se', '#ForMe''se'),
  ('freaky', '#Freaky'),
  ('gaplai', '#Gaplai'),
  ('gfamily', '#Gfamily'),
  ('gvr', '#GVR'),
  ('hanhor', '#HanhOr'),
  ('justatee', '#Justatee'),
  ('kewtiie', '#Kewtiie'),
  ('kimmese', '#Kimmese'),
  ('kosmik', '#Kosmik'),
  ('kts2026', '#KTS2026'),
  ('ladykillah', '#Ladykillah'),
  ('lamar', '#Lamar'),
  ('lk', '#LK'),
  ('northside', '#Northside'),
  ('pjpo', '#Pjpo'),
  ('producer', '#Producer'),
  ('records', '#Records'),
  ('rockycde', '#RockyCDE'),
  ('southside', '#Southside'),
  ('spacespeakers', '#Spacespeakers'),
  ('tnc', '#TNC'),
  ('tncbreakdown', '#TNCBreakdown'),
  ('tnccommunity', '#TNCCommunity'),
  ('tnceditorial', '#TNCEditorial'),
  ('tncmusic101', '#TNCMusic101'),
  ('tncorigins', '#TNCOrigins'),
  ('tncradar', '#TNCRadar'),
  ('tncrecords', '#TNCRecords'),
  ('tncreview', '#TNCReview'),
  ('tncselects', '#TNCSELECTS'),
  ('vietdragon', '#Vietdragon'),
  ('vietdragon-tncorigins-lamar', '#Vietdragon #TNCOrigins #Lamar')

) as v(slug, name)
where public.tags.name = v.name
  and public.tags.deleted_at is null
  and public.tags.slug <> v.slug;


-- ----------------------------------------------------------------------------
-- 4. Vô hiệu hoá 3 bài viết DEMO (fictional, từ seed.sql) đang ở status
--    'published' — PHẢI chạy TRƯỚC bước chèn bài viết thật bên dưới, vì 2 lý
--    do: (a) nếu để nguyên, chúng sẽ hiển thị LẪN với bài viết thật ngay khi
--    site chuyển sang đọc từ Supabase (cùng điều kiện "deleted_at is null and
--    status = 'published'" mà mọi trang public/RLS policy đang dùng); (b) bài
--    demo 'gvr-ky-uc-cua-mot-the-he-rap-viet' trùng CHÍNH XÁC slug với 1 bài
--    viết THẬT — partial unique index articles_slug_key (WHERE deleted_at IS
--    NULL) sẽ chặn insert bài thật nếu bản demo cùng slug chưa được soft-
--    delete trước. Soft-delete (không xoá cứng) để giữ nguyên dữ liệu demo
--    cho mục đích test.sql, chỉ ẩn khỏi các query "published" thật.
--    3 bài archived/scheduled/review/draft khác của seed.sql KHÔNG cần xử lý
--    vì vốn đã không khớp điều kiện "published".
--
--    QUAN TRỌNG cho tính idempotent: lọc thêm "cover_image_url like
--    '/uploads/seed-%'" (tiền tố CHỈ seed.sql dùng, xem seed.sql mục 5) chứ
--    KHÔNG lọc riêng bằng slug — vì slug 'gvr-ky-uc-cua-mot-the-he-rap-viet'
--    sẽ được bài viết THẬT tái sử dụng ngay sau bước này. Nếu chạy lại file
--    này lần 2 mà chỉ lọc theo slug, câu UPDATE sẽ vô tình soft-delete luôn
--    bài viết THẬT vừa chèn (nó cũng có deleted_at is null và cùng slug) —
--    lọc thêm theo cover_image_url đảm bảo CHỈ đúng 3 dòng demo bị ảnh hưởng,
--    không bao giờ đụng tới bài viết thật dù chạy lại bao nhiêu lần.
-- ----------------------------------------------------------------------------
update public.articles set deleted_at = now()
where slug in (
  'gvr-ky-uc-cua-mot-the-he-rap-viet',
  'dsk-khi-dua-con-cua-mat-troi-cat-tieng',
  'amapiano-xu-huong-toan-cau-hay-mot-con-song-ngan'
) and deleted_at is null and cover_image_url like '/uploads/seed-%';

-- ----------------------------------------------------------------------------
-- 5. 20 bài viết thật, đúng thứ tự trong content/articles/ (theo slug)
-- ----------------------------------------------------------------------------

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select '24k-right-tu-def-jam-en-con-uong-tro-thanh-nguoi-inh-hinh-the-he-nghe-si-tiep-theo',
  $t3$24k.Right: Từ Def Jam đến con đường trở thành người định hình thế hệ nghệ sĩ tiếp theo$t3$,
  $t2$Sau sáu năm đồng hành cùng Def Jam Vietnam, 24k.Right được bổ nhiệm vào vị trí Artists Strategy Advisor, trở thành người tham gia định hướng chiến lược phát triển nghệ sĩ của hãng.$t2$,
  $t4$Trong nhiều năm qua, 24k.Right là một trong số ít rapper Việt Nam gắn bó với Def Jam Recordings Vietnam ngay từ những ngày đầu hãng đĩa này đặt nền móng tại thị trường trong nước. Tuy nhiên, điều đáng chú ý ở hành trình của anh không chỉ nằm ở những sản phẩm âm nhạc, mà còn ở cách vai trò của một rapper dần mở rộng sang tư duy chiến lược và phát triển nghệ sĩ.

Tên thật là **Vũ Ngọc Chương**, 24k.Right chính thức ký hợp đồng độc quyền với Def Jam Recordings Vietnam vào năm 2020, trở thành một trong những nghệ sĩ đầu tiên của hãng tại Việt Nam. Là một phần của hệ thống Def Jam Recordings – thương hiệu hip hop trực thuộc Universal Music Group với lịch sử gắn liền cùng nhiều nghệ sĩ lớn trên thế giới – việc gia nhập Def Jam đánh dấu bước chuyển quan trọng trong sự nghiệp của anh, đồng thời mở ra một trong những mô hình hợp tác quốc tế hiếm hoi dành cho rapper Việt Nam ở thời điểm đó.

Sau khi gia nhập Def Jam, 24k.Right tiếp tục phát triển màu sắc trap đặc trưng thông qua nhiều dự án cá nhân và hợp tác. Series **Nội Dung Nhạy Cảm** trở thành dự án dài hơi phản ánh rõ định hướng âm nhạc của anh, trong khi các ca khúc như _Vẫn_, _2 Thằng Bịp_ hay _Khóa Chân_ cùng Mason Nguyen tiếp tục mở rộng dấu ấn của bộ đôi từng gắn bó từ RhymeZone. Bên cạnh đó, sự xuất hiện trong **Def Jam Exclusive Cypher** cùng Obito và Seachains cũng cho thấy vai trò ngày càng rõ nét của anh trong đội hình nghệ sĩ của hãng.

Nếu giai đoạn đầu sự nghiệp được định nghĩa bởi vai trò một rapper, thì năm 2026 đánh dấu bước chuyển đáng chú ý khác. Sau sáu năm đồng hành cùng Def Jam Vietnam, 24k.Right được bổ nhiệm vào vị trí **Artists Strategy Advisor**, trở thành người tham gia định hướng chiến lược phát triển nghệ sĩ của hãng. Vai trò mới không chỉ dừng ở việc cố vấn hình ảnh hay âm nhạc, mà còn mở rộng sang việc xây dựng lộ trình phát triển, tư vấn chiến lược và đồng hành cùng những gương mặt mới trong hệ sinh thái Def Jam Vietnam.

Sự thay đổi này cũng được thể hiện rõ khi 24k.Right đảm nhận vai trò **Host & Artist Strategy Advisor** tại chương trình **The New Gene 2026**. Trong quá trình tuyển chọn và đào tạo thí sinh, anh trực tiếp tham gia đánh giá bản demo, góp ý về beat, tư duy phát triển nghệ sĩ và cách xây dựng bản sắc cá nhân. Đây là công việc khác biệt đáng kể so với vai trò của một rapper biểu diễn, đồng thời phản ánh xu hướng ngày càng phổ biến trong ngành công nghiệp âm nhạc, khi nghệ sĩ giàu kinh nghiệm bắt đầu tham gia vào quá trình phát triển thế hệ kế tiếp.

Nhìn rộng hơn, hành trình của 24k.Right phản ánh một sự thay đổi trong cách rapper Việt Nam xây dựng sự nghiệp. Nếu trước đây mục tiêu chủ yếu là phát hành sản phẩm và biểu diễn, thì ngày càng nhiều nghệ sĩ bắt đầu tham gia vào những vị trí mang tính chiến lược trong các label và tổ chức âm nhạc. Trong trường hợp của 24k.Right, sự chuyển dịch từ nghệ sĩ độc quyền sang cố vấn chiến lược cho thấy vai trò của rapper ngày nay không chỉ dừng lại ở phòng thu hay sân khấu, mà còn mở rộng đến việc góp phần định hình cách một thế hệ nghệ sĩ mới được phát triển trong môi trường chuyên nghiệp.

Ở thời điểm hiện tại, 24k.Right vẫn tiếp tục hoạt động với tư cách nghệ sĩ, đồng thời đảm nhiệm vai trò chiến lược tại Def Jam Vietnam. Hai vị trí này không tách rời nhau, mà cùng phản ánh một giai đoạn mới trong sự nghiệp của anh – nơi kinh nghiệm biểu diễn và tư duy phát triển nghệ sĩ bắt đầu song hành, góp phần mở rộng vai trò của một rapper trong bức tranh ngày càng chuyên nghiệp của ngành công nghiệp âm nhạc Việt Nam.$t4$,
  '/uploads/3895.jpg', 'Def Jam Vietnam',
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-13'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-radar'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = '24k-right-tu-def-jam-en-con-uong-tro-thanh-nguoi-inh-hinh-the-he-nghe-si-tiep-theo' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCRadar', '#24k.right', '#Defjam')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select '5ber1-goc-khac-trong-the-gioi-cua-lang-ld',
  $t6$5BER1: Góc khác trong thế giới của Lăng LD$t6$,
  $t5$Điều làm nên sức hút của 5BER1 không nằm ở việc sử dụng ngôn từ mạnh hay hình tượng giang hồ. Giá trị của dự án nằm ở khả năng biến những câu chuyện rất đời thường thành những lát cắt mang tính phản chiếu.$t5$,
  $t7$https://youtu.be/kbdWq2YHyNU?si=AaRGIDNUwzSm5ICw

Trong nhiều năm, Lăng LD được biết đến với hình ảnh của một rapper có khả năng cân bằng giữa tính đại chúng và chất liệu đời sống. Từ những ca khúc như _Ý Em Sao_, _Tình Bạn Diệu Kỳ_ đến dấu ấn tại _Rap Việt_, anh xây dựng hình ảnh một nghệ sĩ gần gũi, giàu cảm xúc và mang màu sắc miền Tây rõ nét. Thế nhưng, song song với cái tên Lăng LD, vẫn tồn tại một "nhân vật" khác – gai góc hơn, đường phố hơn và cũng tự do hơn trong cách kể chuyện. Đó là **5BER1**, hay còn được cộng đồng gọi bằng cái tên quen thuộc là **5 Cự**.

5BER1 không phải một nghệ sĩ mới, cũng không phải một dự án tách biệt khỏi Lăng LD. Đây là alter ego do chính anh xây dựng để kể những câu chuyện mà hình ảnh của Lăng LD có lẽ không còn phù hợp để truyền tải. Nếu Lăng LD đại diện cho người nghệ sĩ bước lên sân khấu, thì 5BER1 giống như một người quan sát cuộc sống từ những con hẻm, những quán nhậu hay những góc rất đời của miền Tây, nơi ngôn ngữ đường phố, những câu chuyện bôn ba và cả những sai lầm của con người được kể lại một cách trực diện.

Không phải ngẫu nhiên mà hầu hết các sản phẩm của 5BER1 đều xuất hiện trên kênh **Hội Văn Nghệ Đánh Thức Lương Tâm**. Cái tên ấy phần nào phản ánh đúng tinh thần của dự án. Đằng sau lớp vỏ hài hước, những câu rap đầy tiếng lóng hay cách xây dựng nhân vật có phần cường điệu là những câu chuyện về lựa chọn, hậu quả và cách con người đối diện với chính mình. Chính vì vậy, mỗi sản phẩm đều mở đầu bằng lời nhắc rằng nội dung chỉ mang tính hư cấu, được thực hiện với mục đích giải trí và tự cảnh tỉnh, không cổ súy cho những hành vi lệch chuẩn.

Từ **HOÀN LƯƠNG**, **CHIẾN HỮU**, **CHƠI NGU**, **LÀM LIỀU**, **ĐÁM GIỖ BÊN CỒN** đến album **MỘT KIẾP BÔN BA Vol.1**, 5BER1 duy trì một thế giới rất riêng. Ở đó, drill và street rap trở thành nền tảng để Lăng LD kể những câu chuyện giàu tính điện ảnh về tình anh em, những lần sa ngã, khát vọng đổi đời, sự hối hận và những bài học phải trả giá bằng chính cuộc đời. Chất liệu miền Tây hiện diện xuyên suốt, từ cách dùng ngôn ngữ, lối kể chuyện cho đến những hình ảnh rất quen thuộc với người nghe ở vùng sông nước.

Điều làm nên sức hút của 5BER1 không nằm ở việc sử dụng ngôn từ mạnh hay hình tượng giang hồ. Giá trị của dự án nằm ở khả năng biến những câu chuyện rất đời thường thành những lát cắt mang tính phản chiếu. Người nghe có thể bật cười trước một câu punchline, nhưng cũng có thể nhận ra phía sau đó là những lời nhắc về lòng tham, tình bạn, gia đình hay những quyết định tưởng nhỏ nhưng đủ để thay đổi cả cuộc đời. Chính sự pha trộn giữa yếu tố giải trí và tinh thần tự phản tỉnh đã tạo nên bản sắc riêng cho dự án này.

Trong bối cảnh nhiều rapper lựa chọn xây dựng một hình ảnh nhất quán xuyên suốt sự nghiệp, Lăng LD lại chọn cách tách mình thành hai thế giới. Một bên là Lăng LD – nghệ sĩ quen thuộc với công chúng và những sân khấu lớn. Bên còn lại là 5BER1 – nhân vật được tạo ra để nói về những góc tối, những câu chuyện đường phố và những điều rất khó diễn đạt nếu chỉ tồn tại dưới một cái tên duy nhất. Hai hình ảnh ấy không đối lập, mà bổ sung cho nhau để tạo nên chân dung đầy đủ hơn của một nghệ sĩ luôn muốn mở rộng giới hạn biểu đạt của mình.

Có lẽ vì vậy, 5BER1 chưa bao giờ đơn thuần là một dự án phụ. Đó là một không gian sáng tạo riêng, nơi Lăng LD được tự do thử nghiệm, kể chuyện và quan sát xã hội bằng một góc nhìn khác. Và biết đâu, chính những câu chuyện tưởng như rất "lầy lội" ấy lại là những điều phản ánh rõ nhất một phần của đời sống mà rap Việt luôn muốn lưu giữ.$t7$,
  '/uploads/3803.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 3, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'tnc-editorial' and ser.slug = 'tnc-breakdown'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = '5ber1-goc-khac-trong-the-gioi-cua-lang-ld' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCBreakdown', '#5BER1')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'amapiano-xu-huong-toan-cau-hay-chi-la-mot-con-song-ngan-tai-viet-nam',
  $t9$Amapiano: Xu hướng toàn cầu hay chỉ là một cơn sóng ngắn tại Việt Nam?$t9$,
  $t8$Tại Việt Nam, Amapiano bắt đầu xuất hiện thông qua các nền tảng mạng xã hội, những bộ dance challenge và playlist của các DJ.$t8$,
  $t10$Trong vài năm trở lại đây, Amapiano đã trở thành một trong những dòng nhạc phát triển nhanh nhất thế giới. Từ các khu township ở Johannesburg, Nam Phi, thể loại này nhanh chóng xuất hiện trên bảng xếp hạng quốc tế, các festival lớn và đặc biệt là mạng xã hội. Nhưng khi làn sóng ấy lan đến Việt Nam, một câu hỏi bắt đầu được đặt ra: liệu Amapiano đang thật sự hình thành một cộng đồng người nghe, hay chỉ là một xu hướng ngắn hạn được thúc đẩy bởi TikTok và văn hóa club?

Xuất hiện vào cuối thập niên 2010, Amapiano là sự kết hợp giữa deep house, jazz, kwaito và nhiều yếu tố âm nhạc bản địa Nam Phi. Những giai điệu piano lặp lại, tiếng **log drum** đặc trưng, nhịp độ khoảng 110–120 BPM cùng không gian âm thanh giàu tính groove đã tạo nên một bản sắc khác biệt so với EDM hay house truyền thống. Thành công toàn cầu của _Jerusalema_ và hàng loạt nghệ sĩ như Kabza De Small, DJ Maphorisa hay Focalistic đã đưa Amapiano trở thành một trong những dòng nhạc có sức lan tỏa mạnh nhất đầu thập niên 2020.

Tại Việt Nam, Amapiano bắt đầu xuất hiện thông qua các nền tảng mạng xã hội, những bộ dance challenge và playlist của các DJ. Một số club tại TP.HCM và Hà Nội đã đưa Amapiano vào set diễn, trong khi nhiều producer cũng thử nghiệm kết hợp chất liệu này với EDM, house và rap Việt. Tuy nhiên, sự hiện diện của Amapiano vẫn chủ yếu tập trung trong không gian nightlife, thay vì trở thành một dòng nhạc phổ biến trên thị trường đại chúng.

Đó cũng là lý do nhiều ý kiến cho rằng Amapiano đang đi theo quỹ đạo của một xu hướng mạng xã hội hơn là một cuộc dịch chuyển văn hóa. Không ít bản phối chỉ lặp lại công thức quen thuộc gồm piano loop, log drum và vocal chop mà thiếu sự đổi mới. Khi những nền tảng như TikTok liên tục tạo ra các trào lưu mới, một dòng nhạc phát triển quá nhanh cũng có nguy cơ mất đi sức hút nhanh không kém.

Ở chiều ngược lại, lịch sử âm nhạc đại chúng cho thấy không phải mọi thể loại bùng nổ từ mạng xã hội đều biến mất. Afrobeat, UK Garage hay Drill đều từng bị xem là những hiện tượng nhất thời trước khi dần trở thành một phần của thị trường toàn cầu. Amapiano cũng đang tiếp tục phát triển thông qua nhiều nhánh mới, kết hợp với afro house, Latin, UK club music và cả pop, cho thấy đây vẫn là một hệ sinh thái âm nhạc đang vận động thay vì đứng yên.

Với Việt Nam, câu hỏi có lẽ không nằm ở việc Amapiano có còn phổ biến hay không, mà là liệu các nghệ sĩ và producer trong nước có thể biến nó thành một ngôn ngữ âm nhạc của riêng mình. Phần lớn những sản phẩm hiện nay vẫn chịu ảnh hưởng trực tiếp từ bản gốc Nam Phi, trong khi các thử nghiệm mang bản sắc Việt vẫn còn khá ít. Điều này khiến Amapiano được nhìn nhận nhiều hơn như một chất liệu sản xuất thay vì một phong cách sáng tạo độc lập.

Nếu có điều gì quyết định tương lai của Amapiano tại Việt Nam, đó sẽ không phải là TikTok hay các club, mà là khả năng bản địa hóa. Chỉ khi những producer và nghệ sĩ sử dụng cấu trúc của Amapiano để kể những câu chuyện, giai điệu và trải nghiệm mang dấu ấn Việt Nam, dòng nhạc này mới có cơ hội trở thành một phần của thị trường thay vì chỉ là một xu hướng theo mùa.

Đến thời điểm hiện tại, sẽ còn quá sớm để gọi Amapiano là một cuộc cách mạng của nhạc Việt, nhưng cũng chưa đủ cơ sở để xem nó như một "bong bóng". Nó đang ở giữa hai trạng thái đó – một xu hướng đã chứng minh được sức ảnh hưởng toàn cầu, nhưng vẫn cần thời gian để tìm ra vị trí của mình trong hệ sinh thái âm nhạc Việt Nam.$t10$,
  '/uploads/3934.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-18'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-editorial'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'amapiano-xu-huong-toan-cau-hay-chi-la-mot-con-song-ngan-tai-viet-nam' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCEditorial', '#Amapiano')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'back-2-da-culture',
  $t12$BACK 2 DA CULTURE 🚀$t12$,
  $t11$This ain’t just a party.
This is where the culture links up ⬆️$t11$,
  $t13$BACK 2 DA CULTURE 🚀

This ain’t just a party.

This is where the culture links up ⬆️

A night dedicated to the ones pushing the scene forward - rappers, DJs, dancers, creatives, and every soul living the culture. No gimmicks. No filters. Just raw talent, heavy sounds, and real energy.

🎤 RAP LINE-UP

Yung Ni99

Tazle

Bslime

Aight D

L.Y.M

LEO

Teeger

Michael D

🎧 DJ LINE-UP

Alysia

Naomi

Jay

Masta Trieu

Huyju

From live performances to nonstop DJ sets, expect nothing but straight heat all night long. Hip Hop in its purest form, powered by the next generation of voices shaping the culture.

No spectators.

Only contributors.

BACK 2 DA CULTURE 🚀

Built by the culture.

Powered by the community.

See you in the crowd.

Event hosted by @locs_chocs & @hamstu.444

Sponsored by @jagermeister_vn

🎫 Ticket: 150K/pax (Early bird) – 180K/pax (At door)

⏰ Time & Date: 9PM – Late / Saturday, July 11th, 2026

📍 Address: Mor Stereo – 21–23 Ho Tung Mau Street, D1, Ho Chi Minh City.$t13$,
  '/uploads/3823.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 5, '/uploads/3823.jpg',
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-community'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'back-2-da-culture' and t.deleted_at is null
  and t.name in ('#Back2daculture', '#TNCCommunity', '#TNC', '#Evnets')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'dsk-khi-ua-con-cua-mat-troi-cat-tieng',
  $t15$DSK: Khi "đứa con của mặt trời" cất tiếng$t15$,
  $t14$Điều khiến DSK trở nên khác biệt không nằm ở việc anh rap nhanh hơn hay phức tạp hơn những người cùng thời. Điểm nổi bật nhất nằm ở cách anh sử dụng rap như một phương tiện để tự sự.$t14$,
  $t16$https://youtu.be/YPs7ZsJGpB0?si=gPcjOcA_AIspNkSR

Trong lịch sử rap Việt, rất ít nghệ sĩ tạo ra sức ảnh hưởng lớn mà gần như không cần đến thị trường đại chúng. Không có album được quảng bá rầm rộ, không xuất hiện thường xuyên trên truyền hình hay các nền tảng giải trí, DSK vẫn là cái tên liên tục được nhiều thế hệ rapper nhắc đến khi nói về lyricism, storytelling và tư duy sáng tác. Ảnh hưởng của anh không được xây dựng bằng sự hiện diện trước công chúng, mà bằng những bản rap được truyền tay trong cộng đồng underground và cách chúng thay đổi nhận thức về việc rap có thể kể những câu chuyện như thế nào.

Tên thật là Nguyễn Đức Minh (sinh năm 1987), DSK bước vào rap từ những năm đầu thập niên 2000, khi hip-hop Việt Nam vẫn phát triển chủ yếu trên Internet, các diễn đàn và những cộng đồng nhỏ. Đây là giai đoạn rap Việt chưa có một thị trường đúng nghĩa, còn nghệ sĩ và người nghe gặp nhau thông qua những bản MP3 được chia sẻ trực tiếp hoặc các thread trên forum. Trong hành trình ấy, DSK lần lượt hoạt động tại **Genius Viet Rap (GVR)**, **21BlacJac**, **ViGER** và sau này là **S.D Records**. Mỗi cộng đồng đại diện cho một giai đoạn khác nhau của underground Việt Nam, đồng thời phản ánh quá trình phát triển trong tư duy âm nhạc của chính anh.

Điều khiến DSK trở nên khác biệt không nằm ở việc anh rap nhanh hơn hay phức tạp hơn những người cùng thời. Điểm nổi bật nhất nằm ở cách anh sử dụng rap như một phương tiện để tự sự. Trong khi nhiều rapper đầu những năm 2000 tập trung vào battle, thể hiện kỹ thuật hoặc xây dựng hình tượng mạnh mẽ, DSK lại đưa vào âm nhạc những chủ đề ít được khai thác khi đó như sự cô độc, mặc cảm, tình yêu, ký ức, tuổi trưởng thành và những mâu thuẫn nội tâm. Rap của anh không cố gắng đưa ra câu trả lời; nó thường đặt người nghe vào chính những câu hỏi mà tác giả đang đối diện.

Phong cách này cũng được phản ánh trong kỹ thuật thể hiện. Chất giọng khàn đặc trưng, cách nhả chữ có xu hướng "laid-back" cùng cấu trúc gieo vần linh hoạt tạo nên một cảm giác gần với lời kể hơn là trình diễn. DSK không quá phụ thuộc vào những mô hình flow cố định. Thay vào đó, anh để nhịp điệu phục vụ cảm xúc của câu chuyện, khiến mỗi bài rap mang màu sắc rất riêng nhưng vẫn giữ được tính nhạc và sự liền mạch trong ngôn ngữ.

Sự nghiệp của DSK cũng gắn liền với nhiều tác phẩm được xem là dấu mốc của underground Việt Nam. Những bản rap như _Lớn Rồi_, _Chưa Bao Giờ_ hay _Đôi Bờ_ cho thấy rõ khuynh hướng tự sự và chiều sâu trong cách viết lời, nơi mỗi ca khúc giống như một lát cắt của cuộc sống hơn là một sản phẩm giải trí đơn thuần. Ở chiều ngược lại, _Mấy Con Vịt_ lại thể hiện một DSK hoàn toàn khác: sắc bén, quyết liệt và giàu tính phản biện. Ca khúc này trở thành một trong những bản diss được nhắc đến nhiều nhất của rap underground nhờ khả năng xây dựng punchline, chơi chữ và kiểm soát nhịp điệu ngôn ngữ.

Tuy nhiên, sẽ là thiếu sót nếu chỉ nhìn DSK qua các bản thu. Anh còn là một trong những nhân vật góp phần định hình văn hóa battle của rap Việt giai đoạn đầu. Những cuộc đối đầu trong underground không chỉ là sự công kích giữa các cá nhân, mà còn là môi trường để rapper liên tục nâng cao kỹ năng viết lyric, tư duy gieo vần và khả năng phản biện. Trong bối cảnh đó, DSK là một trong những cái tên có ảnh hưởng lớn nhất, không chỉ bởi kỹ thuật mà còn bởi cách anh tiếp cận battle như một cuộc đối thoại bằng ngôn ngữ thay vì chỉ là sự khiêu khích.

Khác với nhiều nghệ sĩ cùng thế hệ, DSK chưa bao giờ xây dựng sự nghiệp theo mô hình của ngành công nghiệp âm nhạc. Anh hiếm khi xuất hiện trước truyền thông, gần như không sử dụng mạng xã hội để quảng bá hình ảnh và cũng không duy trì lịch phát hành sản phẩm đều đặn. Sau nhiều năm sinh sống tại Đức, anh trở về Việt Nam và lựa chọn cuộc sống kín tiếng tại Đà Lạt, tiếp tục sáng tác khi có cảm hứng thay vì chạy theo chu kỳ của thị trường.

Chính sự lựa chọn đó khiến vị trí của DSK trong rap Việt trở nên đặc biệt. Anh không đại diện cho thành công thương mại, cũng không phải gương mặt quen thuộc của công chúng. Thay vào đó, DSK đại diện cho một thế hệ nghệ sĩ underground đặt bản sắc cá nhân và chất lượng sáng tác lên trên khả năng tiếp cận số đông. Hai thập kỷ sau khi xuất hiện, ảnh hưởng của anh vẫn được nhìn thấy trong cách nhiều rapper trẻ xây dựng lyric, kể chuyện và theo đuổi sự độc lập trong sáng tạo. Đó là di sản lớn nhất mà DSK để lại cho rap Việt.$t16$,
  '/uploads/3937.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-19'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-origins'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'dsk-khi-ua-con-cua-mat-troi-cat-tieng' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCOrigins', '#DSK', '#Dasunkid')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'g-family-khi-southside-viet-tiep-cau-chuyen-cua-chinh-minh',
  $t18$G Family - Khi Southside viết tiếp câu chuyện của chính mình$t18$,
  $t17$Được thành lập vào năm 2009 dưới sự dẫn dắt của Acy cùng nhiều rapper như BK, Juni, Torich, Gobi và Datmaniac, G-Family không xuất hiện từ con số không. Đây là kết quả của một cuộc chia tách khỏi GoDz – một trong những tổ chức từng có ảnh hưởng lớn nhất đối với underground miền Nam trong giai đoạn đầu.$t17$,
  $t19$https://youtu.be/oQQtJej_OVw?si=VskmClNpGeqi9T6V

Lịch sử của rap Việt không chỉ được viết bằng những bản hit hay những sân khấu lớn. Nó còn được tạo nên bởi những cuộc chuyển mình của các cộng đồng underground, nơi mỗi quyết định đều có thể làm thay đổi hướng phát triển của cả một thế hệ. Với rap miền Nam, sự ra đời của **G-Family** là một trong những bước ngoặt như vậy.

Được thành lập vào năm 2009 dưới sự dẫn dắt của Acy cùng nhiều rapper như BK, Juni, Torich, Gobi và Datmaniac, G-Family không xuất hiện từ con số không. Đây là kết quả của một cuộc chia tách khỏi **GoDz** – một trong những tổ chức từng có ảnh hưởng lớn nhất đối với underground miền Nam trong giai đoạn đầu. Ngày 5/5/2010, G-Family hoàn thiện đội hình, chính thức hoạt động độc lập và thành lập **G-Century Events**, mở ra một chương mới cho cộng đồng hip hop phía Nam.

Để hiểu vì sao G-Family ra đời, cần nhìn lại GoDz. Được sáng lập bởi VietDragon (VD) và Cree trong những năm đầu của rap Việt, GoDz nhanh chóng xây dựng danh tiếng bằng chất hardcore, gangster rap và tinh thần battle quyết liệt. Đây là nơi quy tụ nhiều rapper có kỹ thuật tốt, đồng thời góp phần hình thành văn hóa beef và battle trong cộng đồng underground. Tuy nhiên, cùng với sự phát triển, những khác biệt về quan điểm, định hướng và cách vận hành dần bộc lộ. Cuộc chia tay giữa Acy và những thành viên còn lại không đơn thuần là mâu thuẫn nội bộ, mà phản ánh sự thay đổi trong cách nhiều rapper muốn xây dựng một cộng đồng bền vững hơn.

Nếu GoDz được nhớ đến bởi sự gai góc và đối đầu, thì G-Family lại mở rộng tinh thần đó theo một hướng khác. Crew vẫn giữ chất hardcore đặc trưng của Southside, nhưng đặt nhiều trọng tâm hơn vào kỹ năng viết, cấu trúc lyric và tính gắn kết của tập thể. Chính điều này giúp G-Family trở thành nơi quy tụ nhiều rapper có cá tính rất khác nhau nhưng cùng chia sẻ một nền tảng kỹ thuật vững chắc.

Trong đội hình của G-Family, Acy được xem là hạt nhân với phong cách viết giàu tính triết lý và khả năng battle đã được khẳng định qua nhiều năm. Bên cạnh anh là Datmaniac với kỹ thuật fast flow và cách kể chuyện giàu chiều sâu, Sol'Bass với lối chơi chữ sắc bén, Blacka cùng chất giọng đặc trưng và nguồn năng lượng mạnh mẽ, hay những cái tên như Worm JB, Cá Nóc, Joka3iz, Lil'Ce, Mikeezy, Zephyr và nhiều thành viên khác. Mỗi người mang theo một màu sắc riêng, nhưng cùng góp phần tạo nên bản sắc của một trong những rap crew có chiều sâu chuyên môn nhất của underground miền Nam.

Âm nhạc của G-Family cũng phản ánh rõ tinh thần ấy. Những dự án như _Sảnh Rồng_, _083_, _Bát Quái_, _N.584_, _Cypher 2G2G_ hay gần đây là _G.Vision_ không chỉ đơn thuần là những bản cypher quy tụ nhiều rapper. Chúng còn là nơi các thành viên thể hiện kỹ thuật, tư duy viết lời và cách xây dựng bản sắc tập thể qua từng verse. Song song với đó, G-Family cũng góp mặt trong nhiều cuộc battle và beef lớn của rap Việt, từ HLBz, SSR, GVR cho đến những màn đối đầu cá nhân đã trở thành một phần lịch sử của underground.

Bên ngoài âm nhạc, G-Family còn đóng vai trò xây dựng cộng đồng thông qua **G-Century Events**, tổ chức nhiều chương trình, sân chơi và hoạt động dành cho rapper trẻ tại TP.HCM. Điều này giúp tập thể không chỉ được nhìn nhận như một rap crew, mà còn là một mắt xích quan trọng trong quá trình phát triển của hip hop miền Nam.

Hơn mười lăm năm sau ngày thành lập, nhiều thành viên đã theo đuổi những con đường khác nhau, rap Việt cũng bước vào thời kỳ đại chúng với sự xuất hiện của các chương trình truyền hình và những thị trường mới. Thế nhưng, G-Family vẫn giữ một vị trí riêng trong ký ức của cộng đồng underground. Không phải vì họ là tập thể đông thành viên nhất hay sở hữu nhiều bản hit nhất, mà bởi họ đại diện cho một giai đoạn mà kỹ năng, tình anh em và tinh thần tập thể luôn được đặt lên hàng đầu.

Nhìn lại lịch sử rap Việt, G-Family không chỉ là cái tên được sinh ra sau một cuộc chia tách. Họ là minh chứng cho cách một cộng đồng có thể tái định nghĩa chính mình, và từ đó tạo nên một trong những chương quan trọng nhất của underground miền Nam.$t19$,
  '/uploads/3888.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 5, null,
  '[]'::jsonb,
  '2026-07-12'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-origins'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'g-family-khi-southside-viet-tiep-cau-chuyen-cua-chinh-minh' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCOrigins', '#Gfamily')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'gvr-ky-uc-cua-mot-the-he-rap-viet',
  $t21$GVR - Ký ức của một thế hệ rap Việt$t21$,
  $t20$Ký ức không thể nào quên về những gương mặt như Lee7, Lil'G, Kay T, Nah, Lil Shady, DK-Love, Lil’Cì, LT Midside, Gizmo, TýT, Zangta, F, M.O.W, Spike, Tommy Blue, Anh Mac và Joke D, cùng nhiều cựu thành viên như Phương CD, DSK, Andree, It’s Lee, BDT, Zolek, GhettoKid, South Edge và EnBien, Khánh HP, Lee7, DSK, Andree Right Hand, Dead Nah (Nah), Lil' Shady, It’s Lee, Viet Dragon và Linh Lam.$t20$,
  $t22$https://youtu.be/kFma9hcQ3OI?si=XvULny4YBBakcKcT

Đến hôm nay, phần lớn dấu vết của GVR chỉ còn lại trong những đường dẫn cũ, vài ảnh chụp màn hình được lưu rải rác và ký ức của những người từng dành hàng giờ trước màn hình máy tính để đọc một thread mới, chờ phản hồi cho bản demo đầu tiên hay theo dõi một cuộc tranh luận kéo dài nhiều trang. Không còn cảm giác “vào forum” như một nghi thức mỗi tối, cũng không còn những cuộc đối thoại diễn ra chậm rãi nhưng gay gắt theo nhịp của một cộng đồng tự vận hành. Nhưng trong lịch sử rap Việt, rất ít không gian số để lại dấu ấn sâu như GVR. Diễn đàn này được thành lập ngày 6/4/2006 với tên ban đầu là German Viet Rap bởi Phương CD và First Love (FL), sau đó phát triển thành Genius Viet Rap, hoạt động trên nhiều nền tảng như h2arapclub.com, gvrproduction.com, gvrweb.com, gvrproduction.net và gvr.vn.

Điều khiến GVR khác với một diễn đàn thông thường không chỉ là tên tuổi của những người từng ghé qua, mà là cách cộng đồng này vận hành. Trước khi rap Việt có mạng xã hội đủ lớn để phát tán một bài rap chỉ trong vài phút, GVR là nơi một ca khúc được “sống” bằng phản biện. Người đăng bài chờ feedback về flow, rhyme, punchline, cách nhả chữ, beat và cả cách đặt câu chữ. Producer chia sẻ beat cho rapper khác thử nghiệm. Người nghe bước vào vai trò của một biên tập viên bất đắc dĩ. Cách vận hành này khiến GVR giống một phòng thảo luận mở hơn là một diễn đàn giải trí, và chính trong môi trường đó, nhiều kỹ thuật nền tảng của rap Việt như vần đôi, vần ba, wordplay và punchline được mài giũa qua tranh luận, va chạm và cả những màn diss công khai.

Nếu nhìn vào danh sách những cái tên từng gắn bó với GVR, có thể thấy diễn đàn này không chỉ quy tụ rapper mà còn gom lại cả một thế hệ đang định hình cách rap Việt sẽ phát triển. Các thread lưu lại dấu vết của những gương mặt như Lee7, Lil'G, Kay T, Nah, Lil Shady, DK-Love, Lil’Cì, LT Midside, Gizmo, TýT, Zangta, F, M.O.W, Spike, Tommy Blue, Anh Mac và Joke D, cùng nhiều cựu thành viên như Phương CD, DSK, Andree, It’s Lee, BDT, Zolek, GhettoKid, South Edge và EnBien. Ở những bài tổng thuật lịch sử rap Việt khác, người ta còn nhắc đến việc GVR từng hút về những nhân tài như Khánh HP, Lee7, DSK, Andree Right Hand, Dead Nah (Nah), Lil' Shady, It’s Lee, Viet Dragon và Linh Lam. Điều quan trọng là không phải tất cả họ đều cùng một thời điểm hay cùng một vai trò, nhưng sự hiện diện của họ cho thấy GVR từng là điểm giao của rất nhiều quỹ đạo khác nhau trong rap Việt.

Từ môi trường đó, rất nhiều sản phẩm đã ra đời và trở thành tư liệu của một thời kỳ. Lee7 là một trong những cái tên gắn chặt nhất với lịch sử GVR, với những bản như _Tiểu Thuyết Tình Yêu_ cùng Andree và It’s Lee, _30 Phút Dành Cho Rap Việt_ cùng Andree, DSK và Phương CD, hay những bài sau này như _Tan Xác_, _Người Đẹp Và Quái Thú_ và _Điên Cuồng_. Andree cũng để lại dấu ấn qua _A,L Double E (Block Us)_, _Pussy Swagga_ và _Most Wanted V-Boi_. Lil Shady có một chuỗi sáng tác như _Color of life_, _Bồ Công Anh_ và _Ngày Mai_. Những sản phẩm này không chỉ là các bài rap được chia sẻ trên mạng; chúng là kết quả hữu hình của một cộng đồng mà ở đó, thread, phản hồi và tranh luận đều có thể biến thành nhạc.

Nhưng nếu GVR chỉ là nơi đăng nhạc, nó đã không còn được nhắc đến nhiều đến vậy. Diễn đàn này còn là nơi battle rap Việt bước sang một giai đoạn khác. _30 Phút Cho Rap Việt_ năm 2007 đã đẩy mâu thuẫn giữa GVR với FHH và một số cộng đồng khác lên mức công khai, kéo theo các bản đáp trả từ RC và những vòng diss tiếp nối. Sau đó là chuỗi đối đầu giữa VietDragon và toàn bộ GVR, daRapClub, VietHipHop trong giai đoạn 2008–2010, khi hàng loạt tên tuổi về sau trở thành những nhân vật quan trọng của rap Việt như DSK, Rhymastic, Andree Right Hand, SilverC, Krazinoiyze, Lee7 và LK bị gọi tên trong các track công kích. Những cuộc chiến ấy có phần hỗn loạn, có lúc tràn ra ngoài đời thật, nhưng đồng thời cũng buộc rapper phải nâng tay nghề. Chính xung đột đã góp phần đẩy những kỹ thuật như vần đôi, vần ba, wordplay và punchline lên một mặt bằng mới, thứ sau này trở thành tiêu chuẩn của rất nhiều rapper trẻ.

Đến khi Facebook, YouTube và rồi các nền tảng streaming dần trở thành trung tâm của đời sống âm nhạc, kiểu cộng đồng forum như GVR không còn giữ vị trí cũ nữa. Những thread cũ mờ dần, các đường dẫn biến mất, và một thời kỳ mà rap được học thông qua tranh luận, phản biện và chờ đợi cũng lùi về phía sau. Nhưng nếu nhìn lại rap Việt hôm nay, vẫn có thể thấy dấu vết của GVR trong cách nghệ sĩ viết lời, cách cộng đồng bàn về lyric và cách người nghe coi rap như một nền văn hóa cần được đọc, được tranh luận và được lưu trữ. GVR không còn là nơi người ta mở trình duyệt để bắt đầu một ngày với rap nữa, nhưng nó vẫn còn ở đó như một lớp nền của ký ức, nơi rap Việt từng tự học cách trở thành chính mình.$t22$,
  '/uploads/3936.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-19'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-origins'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'gvr-ky-uc-cua-mot-the-he-rap-viet' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCOrigins', '#GVR', '#Andreerighthand', '#Vietdragon', '#LK')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'gap-lai-cua-binz-hanh-trinh-tro-ve-voi-chinh-minh-sau-anh-hao-quang',
  $t24$"Gặp Lại" của Binz: Hành trình trở về với chính mình sau ánh hào quang$t24$,
  $t23$Trong nhiều năm, Binz là một trong những nghệ sĩ hiếm hoi liên tục thay đổi màu sắc âm nhạc. Anh từng thử nghiệm với hip hop, R&B, chất liệu bolero hiện đại, thơ ca và nhiều cách thể hiện khác nhau để mở rộng giới hạn sáng tạo của mình.$t23$,
  $t25$https://youtu.be/xubKh9u0uDY?si=iTmZOHvy7gulmFuQ

Sau gần hai thập kỷ hoạt động, Binz chính thức phát hành album phòng thu đầu tay _Gặp Lại_ vào ngày 24/5/2026. Với thời lượng hơn 42 phút gồm 10 ca khúc chính cùng Intro và Outro, đây không chỉ là cột mốc đáng nhớ trong sự nghiệp của nam rapper mà còn đánh dấu một bước chuyển quan trọng trong tư duy sáng tác của Lê Nguyễn Trung Đan. Nếu trước đây công chúng biết đến Binz qua hình ảnh "Bigcityboi" hào nhoáng, phóng khoáng và đầy tự tin, thì _Gặp Lại_ lại lựa chọn một hướng đi đối lập. Album không cố xây dựng thêm một hình tượng mới, mà đưa người nghe quay trở về với con người phía sau ánh đèn sân khấu, nơi những ký ức, tổn thương và cảm xúc cá nhân được đặt ở vị trí trung tâm.

Trong nhiều năm, Binz là một trong những nghệ sĩ hiếm hoi liên tục thay đổi màu sắc âm nhạc. Anh từng thử nghiệm với hip hop, R&B, chất liệu bolero hiện đại, thơ ca và nhiều cách thể hiện khác nhau để mở rộng giới hạn sáng tạo của mình. Tuy nhiên, sau chương trình _Anh Trai Vượt Ngàn Chông Gai_ cùng EP _Keep Cầm Ca_ phát hành năm 2024, Binz dường như lựa chọn một nhịp đi chậm hơn. _Gặp Lại_ là kết quả của khoảng thời gian nhìn vào bên trong nhiều hơn là hướng ra bên ngoài. Dưới phần sản xuất của Javix, piano, violin và guitar được sử dụng một cách tiết chế, tạo nên không gian tối giản để lời rap và những đoạn tự sự trở thành trọng tâm. Ngay từ Intro, câu nói "Sự thật đẹp nhất lúc nó trần trụi" đã đặt nền tảng cho toàn bộ album, như một lời khẳng định về tinh thần mà Binz muốn theo đuổi trong dự án lần này.

_Gặp Lại_ được xây dựng như một hành trình đi ngược dòng thời gian. Từ _Con Nít_, nơi những ký ức tuổi thơ bắt đầu được mở ra, đến _Hững Hờ_, _Nếu_ cùng Obito hay _Nợ_ với Hà Lê, mỗi ca khúc đều đại diện cho một giai đoạn khác nhau trong cuộc đời của người nghệ sĩ. Album không được xây dựng quanh những bản hit riêng lẻ mà vận hành như một câu chuyện liền mạch, theo chân một con người trưởng thành qua tình yêu, thành công, những mất mát và cả những điều chưa từng có cơ hội nói thành lời. _Em_ với sự góp mặt của Soobin mang đến một diện mạo mới cho ca khúc quen thuộc, trong khi _Không Ai_, _Bao Giờ Mới Nói_ và đặc biệt là ca khúc chủ đề _Gặp Lại_ cùng Phan Mạnh Quỳnh đưa câu chuyện tiến sâu hơn vào những khúc mắc gia đình, hình ảnh người cha và hành trình chữa lành sau nhiều năm đối diện với chính mình.

Điều đáng chú ý ở album không nằm ở việc phô diễn kỹ thuật rap hay những màn trình diễn flow phức tạp. Binz lựa chọn cách kể chuyện chậm rãi, sử dụng ngôn ngữ giàu hình ảnh và khoảng lặng trong âm nhạc để cảm xúc dẫn dắt toàn bộ trải nghiệm. Chính sự tiết chế ấy khiến lời rap trở nên nổi bật hơn, đồng thời tiếp tục khẳng định lý do nhiều khán giả xem anh là một trong những cây bút giàu chất thơ của rap Việt. Ranh giới giữa rap, hát, tự sự và thơ ca được làm mờ đi để nhường chỗ cho những trải nghiệm rất cá nhân nhưng vẫn đủ sức tạo nên sự đồng cảm.

Ngay sau khi phát hành, _Gặp Lại_ nhanh chóng nhận được nhiều sự quan tâm trên các nền tảng nhạc số và tạo nên nhiều cuộc thảo luận trong cộng đồng người nghe. Tuy nhiên, giá trị lớn nhất của album có lẽ không nằm ở những con số. Thay vì tiếp tục khai thác công thức đã mang lại thành công trong quá khứ, Binz chấp nhận bước chậm lại để thực hiện một dự án giàu tính cá nhân hơn, nơi sự thành thật được đặt lên trên tính thị trường. Có thể xem _Gặp Lại_ là một cột mốc quan trọng trong sự nghiệp của anh, không chỉ vì đây là album phòng thu đầu tay, mà bởi nó ghi lại thời điểm Lê Nguyễn Trung Đan lựa chọn đối diện với chính mình sau nhiều năm đứng dưới ánh hào quang. Đó không chỉ là hành trình của một nghệ sĩ, mà còn là câu chuyện về một con người học cách quay trở về với những điều nguyên bản nhất của bản thân.

**Đánh giá: 9/10**$t25$,
  '/uploads/3782.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 3, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-records'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'gap-lai-cua-binz-hanh-trinh-tro-ve-voi-chinh-minh-sau-anh-hao-quang' and t.deleted_at is null
  and t.name in ('#TNC', '#Binz', '#Gaplai', '#Album', '#TNCRecords')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'hieu-thu-nhat-phia-sau-hieuthuhai',
  $t27$Hiếu thứ nhất phía sau HIEUTHUHAI$t27$,
  $t26$Khi nhắc đến HIEUTHUHAI, khán giả thường nghĩ đến một trong những rapper thành công nhất của thế hệ mới. Nhưng phía sau nhiều sản phẩm góp phần tạo nên màu sắc âm nhạc của anh lại là một cái tên khác, cũng mang tên Hiếu. Đó là Đinh Minh Hiếu, hay còn được biết đến với nghệ danh Kewtiie – producer đang đứng sau nhiều bản phối quan trọng của HIEUTHUHAI, GERDNANG và hàng loạt nghệ sĩ trẻ trong những năm gần đây.$t26$,
  $t28$Sinh ngày 16/10/1999 tại Hà Nội, Kewtiie không bước vào âm nhạc theo con đường truyền thống. Trước khi trở thành producer, anh từng theo đuổi mỹ thuật và dành nhiều thời gian cho hội họa. Chính nền tảng ấy phần nào ảnh hưởng đến cách anh xây dựng âm thanh sau này, khi mỗi bản phối đều được xử lý như một không gian có màu sắc, cảm xúc và câu chuyện riêng thay vì chỉ đơn thuần là phần nền cho giọng hát.

Kewtiie bắt đầu được biết đến trong giai đoạn 2016–2018 thông qua các sản phẩm hợp tác với Marzuz, Haisam, Gill và nhiều nghệ sĩ thuộc làn sóng indie đầu tiên. Khoảng thời gian hoạt động cùng District 8, bên cạnh Onionn và Marzuz, trở thành bước đệm quan trọng giúp anh hoàn thiện tư duy sản xuất. Thay vì gắn mình với một thể loại cố định, Kewtiie lựa chọn thử nghiệm liên tục giữa hip hop, R&B, pop, drill, ambient và lo-fi, từ đó hình thành phong cách linh hoạt – yếu tố sau này trở thành điểm mạnh trong sự nghiệp của anh.

Bước ngoặt lớn nhất đến khi Kewtiie bắt đầu đồng hành cùng HIEUTHUHAI và GERDNANG. Những ca khúc như _Ngủ Một Mình (Tình Rất Tình)_, _NOLOVENOLIFE_, _Exit Sign_, _Cho Em An Toàn_, _Mamma Mia_, _Dynamic Duo_, _Nghe Như Tình Yêu_ hay _Vệ Tinh_ đều mang dấu ấn của anh trong vai trò producer. Không chỉ dừng lại ở rap, Kewtiie còn tham gia sản xuất cho nhiều nghệ sĩ khác như Gill, Mỹ Mỹ, Linh Ka và các tiết mục trong chương trình _Anh Trai Say Hi_, cho thấy khả năng thích nghi với nhiều màu sắc âm nhạc khác nhau.

Điều khiến Kewtiie trở thành một trong những producer được săn đón nhất không nằm ở việc tạo ra một kiểu beat đặc trưng, mà ở khả năng lắng nghe từng nghệ sĩ để xây dựng phần âm thanh phù hợp với cá tính của họ. Từ những bản drill giàu năng lượng, những ca khúc pop hướng đến đại chúng cho đến các bản phối mang màu sắc ambient hay lo-fi, anh đều lựa chọn cách tiếp cận khác nhau thay vì lặp lại một công thức đã thành công. Producer tag **"Hey Kewtiie!"** xuất hiện ở đầu nhiều ca khúc cũng dần trở thành dấu ấn quen thuộc, giúp người nghe nhận ra sự hiện diện của anh chỉ sau vài giây đầu tiên.

Sự xuất hiện của Kewtiie cũng phản ánh một sự thay đổi lớn trong thị trường âm nhạc Việt Nam. Nếu trước đây producer thường đứng phía sau hậu trường và ít được công chúng biết đến, thì hiện nay, tên tuổi của họ đã trở thành một phần quan trọng trong cách khán giả tiếp cận âm nhạc. Người nghe không chỉ quan tâm nghệ sĩ thể hiện ca khúc, mà còn chú ý đến người tạo nên âm thanh phía sau nó. Trong bối cảnh ấy, Kewtiie là một trong những đại diện tiêu biểu của thế hệ producer mới – những người không chỉ tạo beat mà còn góp phần định hình bản sắc âm nhạc của cả một thế hệ nghệ sĩ.

Ở tuổi ngoài hai mươi, Kewtiie vẫn tiếp tục mở rộng hành trình sáng tạo của mình thông qua những dự án và sự hợp tác mới. Dù từng vướng phải một số tranh luận trên mạng xã hội, những đóng góp của anh đối với rap và nhạc Việt vẫn là điều khó có thể phủ nhận. Từ một chàng trai theo học mỹ thuật đến một trong những producer được nhắc đến nhiều nhất hiện nay, hành trình của Đinh Minh Hiếu cho thấy đôi khi người tạo nên dấu ấn lớn nhất lại không phải là người đứng ở trung tâm sân khấu, mà là người âm thầm đứng phía sau, định hình âm thanh cho cả một thế hệ.$t28$,
  '/uploads/3826.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 2, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-radar'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'hieu-thu-nhat-phia-sau-hieuthuhai' and t.deleted_at is null
  and t.name in ('#Kewtiie', '#Producer', '#TNC', '#TNCRadar')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'kimmese-cong-bo-concert-solo-au-tien-sau-hon-20-nam-hoat-ong',
  $t30$Kimmese công bố concert solo đầu tiên sau hơn 20 năm hoạt động$t30$,
  $t29$Chương trình sẽ diễn ra vào ngày 15/8/2026 tại 8889 Station (Khu đô thị Vạn Phúc, TP.HCM), đánh dấu một cột mốc mới của nữ rapper, ca sĩ và nhạc sĩ từng góp phần định hình thế hệ đầu của R&B và hip hop Việt Nam.$t29$,
  $t31$Sau hơn hai thập kỷ hoạt động, Kimmese chính thức công bố **For Me'se | 1ST CONCERT**, live concert solo đầu tiên trong sự nghiệp. Chương trình sẽ diễn ra vào ngày 15/8/2026 tại 8889 Station (Khu đô thị Vạn Phúc, TP.HCM), đánh dấu một cột mốc mới của nữ rapper, ca sĩ và nhạc sĩ từng góp phần định hình thế hệ đầu của R&B và hip hop Việt Nam.

Theo chia sẻ từ Kimmese, **For Me'se** mang ý nghĩa "dành cho chúng ta" – không chỉ là một đêm diễn nhìn lại chặng đường âm nhạc của riêng cô, mà còn là cuộc gặp gỡ giữa nghệ sĩ và những khán giả đã đồng hành qua nhiều giai đoạn khác nhau. Từ những ca khúc đầu tiên trong thập niên 2000 đến các dự án gần đây, concert được xây dựng như một hành trình kết nối ký ức, nơi âm nhạc trở thành cầu nối giữa quá khứ và hiện tại.

Đồng hành cùng Kimmese trong dự án là **Mess.** với vai trò Giám đốc Âm nhạc. Thay vì tái hiện nguyên bản các ca khúc cũ, ê-kíp lựa chọn làm mới toàn bộ không gian âm thanh bằng sự kết hợp giữa electronic, R&B, hip hop và những chất liệu văn hóa vùng cao Sơn La. Bên cạnh đó, nghệ sĩ **Cường Tống** cũng tham gia với vai trò đồng sáng tạo, mang đến góc nhìn giao thoa giữa hip hop, nhạc phim và nhạc giao hưởng. Đêm diễn còn có sự góp mặt của **JustaTee** và **Tiên Tiên**, hứa hẹn mở rộng câu chuyện âm nhạc vượt ra ngoài khuôn khổ một concert cá nhân.

Ban tổ chức cũng đã công bố sơ đồ cùng các hạng vé chính thức. Vé VIP (ngồi) có giá 1.990.000 đồng, hạng Platinum (đứng) 990.000 đồng và hạng GA (đứng) 590.000 đồng. Vé hiện đã được mở bán thông qua hệ thống phân phối chính thức.

Không chỉ là concert solo đầu tiên của Kimmese, **For Me'se** còn phản ánh một xu hướng đáng chú ý của thị trường âm nhạc Việt Nam, khi ngày càng nhiều nghệ sĩ lựa chọn kể lại hành trình sáng tạo của mình bằng những chương trình được đầu tư như một tác phẩm hoàn chỉnh, thay vì đơn thuần là một đêm biểu diễn. Sau hơn 20 năm hoạt động, đây có thể xem là thời điểm Kimmese nhìn lại chặng đường đã qua, đồng thời mở ra một chương mới trong sự nghiệp của mình.$t31$,
  '/uploads/3931.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-16'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-radar'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'kimmese-cong-bo-concert-solo-au-tien-sau-hon-20-nam-hoat-ong' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCRadar', '#Kimmese', '#ForMe''se')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'kosmik-2026-khi-spacespeakers-ua-san-khau-cua-minh-en-las-vegas',
  $t33$KOSMIK 2026: Khi SpaceSpeakers đưa sân khấu của mình đến Las Vegas$t33$,
  $t32$Dàn nghệ sĩ góp mặt gần như quy tụ đầy đủ những gương mặt quen thuộc của SpaceSpeakers, bao gồm Touliver, Soobin, Binz, Rhymastic, Kimmese, Andree Right Hand, Lil Wuyn và 16 Typh,...$t32$,
  $t34$Sau 15 năm hoạt động, SpaceSpeakers lựa chọn Las Vegas làm điểm đến cho **KOSMIK Live Concert 2026**. Diễn ra trong hai đêm 4 và 5/7, chương trình không đơn thuần đánh dấu cột mốc của một label, mà còn phản ánh cách một tập thể từng trưởng thành từ underground đang từng bước mở rộng phạm vi hoạt động ra ngoài Việt Nam.

Khi thành lập vào năm 2011, SpaceSpeakers là nơi quy tụ những producer và rapper theo đuổi hip hop trong bối cảnh thể loại này vẫn còn là một dòng chảy tương đối nhỏ. Sau hơn một thập kỷ, tập thể do Touliver dẫn dắt đã góp phần đưa rap và hip hop tiến gần hơn với công chúng thông qua những nghệ sĩ như Soobin, Binz, Rhymastic, Kimmese, Andree Right Hand cùng nhiều cộng sự khác. Hành trình ấy không chỉ được đo bằng những bản hit hay các sân khấu lớn, mà còn bằng cách họ từng bước xây dựng một hệ sinh thái sáng tạo mang dấu ấn riêng.

KOSMIK là một phần trong quá trình đó. Phiên bản đầu tiên tổ chức tại TP.HCM năm 2022 từng gây chú ý với mô hình trình diễn immersive, nơi khoảng cách giữa nghệ sĩ và khán giả gần như được xóa bỏ. Thay vì đứng trước một sân khấu truyền thống, người xem trở thành một phần của không gian biểu diễn. Đến năm 2026, ý tưởng này tiếp tục được phát triển tại Las Vegas với quy mô lớn hơn, kết hợp hệ thống âm thanh, ánh sáng và thiết kế sân khấu nhằm tạo nên một trải nghiệm mang tính thị giác lẫn cảm xúc.

Dàn nghệ sĩ góp mặt gần như quy tụ đầy đủ những gương mặt quen thuộc của SpaceSpeakers, bao gồm Touliver, Soobin, Binz, Rhymastic, Kimmese, Andree Right Hand, Lil Wuyn và 16 Typh, bên cạnh các khách mời như Kiên Ứng, Bùi Lan Hương, Kay Trần, Bùi Công Nam và Xuân Nghi. Việc giữ kín một nghệ sĩ đặc biệt đến sát ngày diễn cũng tạo thêm sự chờ đợi cho khán giả theo dõi chương trình.

Tuy nhiên, điều đáng chú ý ở KOSMIK 2026 không chỉ nằm ở line-up hay quy mô sản xuất. Việc lựa chọn Las Vegas cho thấy định hướng mới của SpaceSpeakers trong việc tiếp cận cộng đồng người Việt ở nước ngoài cũng như thử nghiệm khả năng đưa các chương trình mang thương hiệu Việt đến những thị trường lớn hơn. Đây không phải lần đầu nghệ sĩ Việt biểu diễn tại Mỹ, nhưng là một trong số ít trường hợp một label tổ chức chương trình mang tính thương hiệu của riêng mình ở nước ngoài, thay vì tham gia một sự kiện có sẵn.

Ở góc độ rộng hơn, KOSMIK 2026 phản ánh sự thay đổi của rap và hip hop Việt Nam trong những năm gần đây. Nếu trước đây mục tiêu chủ yếu là khẳng định vị trí trong thị trường nội địa, thì ngày càng nhiều nghệ sĩ và đơn vị sản xuất bắt đầu hướng đến việc xây dựng những dự án có khả năng tiếp cận khán giả quốc tế. Dù hành trình đó vẫn còn nhiều thách thức, việc một tập thể như SpaceSpeakers lựa chọn bước ra khỏi vùng an toàn cho thấy tham vọng phát triển của họ không còn giới hạn trong phạm vi một thị trường.

Có thể KOSMIK 2026 chưa phải là đích đến của hành trình ấy. Nhưng với SpaceSpeakers, đây là một cột mốc cho thấy cách một tập thể từng đi lên từ underground đang tiếp tục mở rộng thế giới âm nhạc mà họ đã xây dựng suốt 15 năm qua.$t34$,
  '/uploads/3824.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-radar'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'kosmik-2026-khi-spacespeakers-ua-san-khau-cua-minh-en-las-vegas' and t.deleted_at is null
  and t.name in ('#Kosmik', '#Spacespeakers', '#TNC', '#TNCRadar')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'kts2026-khi-hanh-or-rocky-cde-va-freaky-ke-cau-chuyen-ve-khu-tao-song',
  $t36$KTS2026: Khi Hành Or, Rocky CDE và Freaky kể câu chuyện về "khu tao sống"$t36$,
  $t35$Không chỉ đơn thuần nói về một địa điểm, "khu tao sống" trở thành biểu tượng cho nơi mỗi người lớn lên, những mối quan hệ đã hình thành nên bản thân và niềm tự hào về nguồn cội.$t35$,
  $t37$https://youtu.be/E64bsWgs8_w?si=47iMjpFAos7gGXSv

Sau khi phát hành, **KTS2026** nhanh chóng thu hút sự chú ý của cộng đồng rap Việt khi đạt hơn 2,2 triệu lượt xem trên YouTube chỉ sau vài tháng. Tuy nhiên, sức hút của ca khúc không chỉ đến từ những con số, mà còn nằm ở cách Hành Or, Rocky CDE và Freaky cùng xây dựng một bức tranh đậm màu sắc miền Tây và tinh thần underground.

Được sản xuất bởi Hổ, **KTS2026** vận hành trên nền trap hiện đại với tiết tấu mạnh, bass dày và phần melody được tiết chế vừa đủ để tạo không gian cho ba rapper thể hiện cá tính. Đây không phải là một bản nhạc đặt nặng yếu tố kỹ thuật hay thử nghiệm, mà tập trung vào năng lượng, tính kết nối và bản sắc địa phương.

Ngay từ tên gọi, "Khu Tao Sống" đã cho thấy chủ đề xuyên suốt của ca khúc. Không chỉ đơn thuần nói về một địa điểm, "khu tao sống" trở thành biểu tượng cho nơi mỗi người lớn lên, những mối quan hệ đã hình thành nên bản thân và niềm tự hào về nguồn cội. Trong cách kể của Hành Or, đó là hành trình đi từ những ngày còn nhiều va vấp đến khi âm nhạc dần được nhiều người biết đến, nhưng vẫn giữ nguyên tinh thần của những ngày đầu.

Freaky mang đến một màu sắc khác với flow giàu tính giai điệu và cách nhấn nhá tự nhiên. Câu rap "Dắt mày về An Giang – Cửu Long Gang" trở thành một trong những điểm nhấn đáng nhớ của bài hát khi vừa gợi mở hình ảnh miền Tây, vừa khẳng định tinh thần gắn kết của những người cùng xuất phát từ một vùng đất. Trong khi đó, Rocky CDE bổ sung thêm năng lượng và tạo nên sự cân bằng trong tổng thể, giúp ba nghệ sĩ giữ được sự khác biệt mà không làm mất đi tính thống nhất của ca khúc.

Phần hình ảnh cũng góp phần hoàn thiện trải nghiệm của **KTS2026**. MV được thực hiện bởi đội ngũ SOP với nhiều hiệu ứng thị giác, kỹ thuật dựng hiện đại và phần màu sắc được đầu tư, mang đến một tổng thể chỉn chu, phù hợp với tinh thần của bài hát.

Điều đáng chú ý là **KTS2026** không cố gắng kể một câu chuyện lớn lao. Ca khúc lựa chọn những chi tiết gần gũi, những trải nghiệm đời thường và niềm tự hào về nơi mình thuộc về để kết nối với người nghe. Chính sự chân thật đó giúp bài hát nhận được sự đồng cảm từ nhiều khán giả, đặc biệt là những người trẻ đến từ khu vực miền Tây.

Trong bối cảnh rap Việt ngày càng xuất hiện nhiều màu sắc và góc nhìn khác nhau, **KTS2026** là một ví dụ cho thấy bản sắc địa phương vẫn luôn có chỗ đứng nếu được thể hiện một cách rõ ràng và nhất quán. Thay vì chạy theo những xu hướng ngắn hạn, Hành Or, Rocky CDE và Freaky lựa chọn kể câu chuyện của chính mình, về chính nơi họ lớn lên.

Có thể đó cũng là lý do khiến "Khu Tao Sống" không chỉ dừng lại ở tên một ca khúc, mà trở thành cách ba nghệ sĩ khẳng định bản sắc của mình trong bức tranh rộng lớn của rap Việt đương đại.$t37$,
  '/uploads/3750.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 5, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-reviews'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'kts2026-khi-hanh-or-rocky-cde-va-freaky-ke-cau-chuyen-ve-khu-tao-song' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCReview', '#Lamar', '#HanhOr', '#Freaky', '#RockyCDE', '#KTS2026')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'ladykillah-va-mot-chuong-khong-the-thieu-cua-rap-viet',
  $t39$LadyKillah và một chương không thể thiếu của rap Việt.$t39$,
  $t38$Ảnh hưởng của LadyKillah không chỉ đến từ những sản phẩm âm nhạc. Đây còn là môi trường giúp nhiều nghệ sĩ phát triển trước khi xây dựng sự nghiệp riêng.$t38$,
  $t40$https://youtu.be/5AfSpD2ltPg?si=YojyfAuOlGLZ6yvO

Trước khi rap Việt trở thành một phần của thị trường âm nhạc đại chúng, LadyKillah đã xuất hiện như một trong những tập thể đầu tiên chứng minh rằng rap và R&B hoàn toàn có thể bước ra khỏi cộng đồng underground để tiếp cận đông đảo khán giả. Trong giai đoạn đầu thập niên 2010, khi phần lớn rap vẫn gắn liền với battle, freestyle và những bản thu phát hành trên các diễn đàn, LadyKillah lựa chọn một hướng đi khác: kết hợp rap với R&B và pop để tạo nên những ca khúc dễ tiếp cận hơn nhưng vẫn giữ được tinh thần của hip hop.

Được thành lập vào ngày 3/3/2010 bởi Lil' Knight và JustaTee, LadyKillah nhanh chóng trở thành điểm gặp gỡ của nhiều nghệ sĩ trẻ. Mỗi thành viên mang theo một màu sắc riêng, nhưng cùng chia sẻ một tư duy âm nhạc cởi mở, nơi rap không bị giới hạn trong những khuôn mẫu vốn có. Chính sự kết hợp giữa phần rap, giai điệu R&B và tư duy sản xuất hiện đại đã tạo nên những ca khúc như _Thu Cuối_, _She Neva Knows_, _Xin Anh Đừng_, _Ngọn Nến Trước Gió_ hay _Crying Over You_ – những bản nhạc góp phần định hình thị hiếu của một thế hệ khán giả trẻ.

Ảnh hưởng của LadyKillah không chỉ đến từ những sản phẩm âm nhạc. Đây còn là môi trường giúp nhiều nghệ sĩ phát triển trước khi xây dựng sự nghiệp riêng. Bên cạnh Lil' Knight, JustaTee, BigDaddy và Emily, Sơn Tùng M-TP cũng từng có thời gian sinh hoạt trong tập thể này trước khi bước vào con đường solo. Dù mỗi người sau đó lựa chọn một hướng đi khác nhau, LadyKillah vẫn là điểm giao thoa trong hành trình của nhiều gương mặt quan trọng của nhạc Việt đương đại.

Ngày nay, LadyKillah không còn hoạt động với cường độ như những năm đầu, nhưng dấu ấn của tập thể này vẫn hiện diện trong cách rap và R&B Việt Nam phát triển. Họ không phải là những người đầu tiên làm rap tại Việt Nam, nhưng là một trong những tập thể đầu tiên giúp dòng nhạc này tiếp cận công chúng rộng rãi hơn mà không đánh mất bản sắc. Nhìn lại lịch sử underground Việt Nam, LadyKillah không chỉ là tên của một rap crew, mà còn là biểu tượng của giai đoạn rap bắt đầu bước qua ranh giới giữa underground và mainstream, mở ra một chương mới cho nhiều thế hệ nghệ sĩ sau này.$t40$,
  '/uploads/3868.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-origins'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'ladykillah-va-mot-chuong-khong-the-thieu-cua-rap-viet' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCOrigins', '#Ladykillah', '#Justatee', '#LK')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'mot-album-uoc-trien-khai-nhu-the-nao-trong-nganh-cong-nghiep-am-nhac-hien-ai',
  $t42$Một album được triển khai như thế nào trong ngành công nghiệp âm nhạc hiện đại?$t42$,
  $t41$Với phần lớn nghệ sĩ thuộc các hãng thu âm lớn tại Mỹ, album ngày nay được phát triển như một dự án dài hạn, nơi âm nhạc chỉ là một trong nhiều thành phần cấu thành.$t41$,
  $t43$Trong nhiều năm, việc sản xuất album thường được hình dung theo một quy trình khá đơn giản: nghệ sĩ bước vào phòng thu, hoàn thành một số lượng ca khúc nhất định rồi lên kế hoạch phát hành. Tuy nhiên, cách vận hành đó đã thay đổi đáng kể trong kỷ nguyên streaming. Với phần lớn nghệ sĩ thuộc các hãng thu âm lớn tại Mỹ, album ngày nay được phát triển như một dự án dài hạn, nơi âm nhạc chỉ là một trong nhiều thành phần cấu thành.

Thay vì bắt đầu bằng các buổi thu âm, quá trình phát triển album thường khởi động bằng giai đoạn định vị. Đội ngũ quản lý, A&R và nghệ sĩ sẽ cùng xác định mục tiêu của dự án: album này đại diện cho giai đoạn nào trong sự nghiệp, hướng đến nhóm khán giả nào và sẽ xây dựng hình ảnh ra sao. Đây là cơ sở để lựa chọn producer, songwriter, nghệ sĩ khách mời cũng như toàn bộ định hướng sáng tạo về sau.

Sau khi định hướng được thống nhất, quá trình sáng tác mới thực sự bắt đầu. Trên thực tế, số lượng bản demo được tạo ra thường lớn hơn rất nhiều so với số ca khúc xuất hiện trong album. Với nhiều nghệ sĩ quốc tế, việc hoàn thành từ vài chục đến hơn một trăm bản demo cho một album không phải điều hiếm gặp. Quá trình chọn lọc này nhằm đảm bảo các ca khúc không chỉ có chất lượng riêng mà còn tạo nên một tổng thể thống nhất về mặt âm thanh và nội dung.

Ở giai đoạn này, A&R giữ vai trò quan trọng trong việc kết nối các nguồn lực sáng tạo. Họ làm việc với producer, songwriter và nghệ sĩ để phát triển dự án theo đúng định hướng ban đầu, đồng thời đánh giá khả năng thương mại của từng ca khúc. Thứ tự bài hát, lựa chọn single, nghệ sĩ góp giọng hay thậm chí thời lượng album đều có thể được điều chỉnh nhiều lần trước khi hoàn thiện.

Trong khi phần âm nhạc tiếp tục được phát triển, các bộ phận khác cũng bắt đầu tham gia. Đội ngũ hình ảnh xây dựng artwork và visual identity, stylist phát triển ngôn ngữ thời trang, đạo diễn chuẩn bị music video, còn bộ phận marketing lên kế hoạch truyền thông. Thay vì chờ album hoàn thành rồi mới quảng bá, nhiều chiến dịch hiện nay được triển khai song song với quá trình sản xuất nhằm đảm bảo mọi thành phần của dự án đều thống nhất về mặt nhận diện.

Sự phát triển của nền tảng streaming cũng làm thay đổi cách các hãng thu âm đánh giá một album. Dữ liệu từ Spotify, Apple Music, YouTube hay TikTok được sử dụng để theo dõi hành vi người nghe, xác định ca khúc có tiềm năng trở thành single và xây dựng chiến lược phát hành. Dù vậy, dữ liệu không thay thế quá trình sáng tạo mà chủ yếu đóng vai trò hỗ trợ các quyết định về kinh doanh và tiếp thị.

Đến giai đoạn phát hành, album thường không còn được xem là điểm kết thúc của dự án. Music video, phiên bản deluxe, tour diễn, merchandise, các buổi biểu diễn trực tiếp và nội dung trên mạng xã hội tiếp tục kéo dài vòng đời của album trong nhiều tháng hoặc nhiều năm sau đó. Không ít ca khúc chỉ thực sự đạt được thành công thương mại sau khi album đã phát hành một thời gian, nhờ những màn trình diễn trực tiếp hoặc xu hướng trên các nền tảng số.

Chính vì vậy, trong ngành công nghiệp âm nhạc hiện nay, album được nhìn nhận như một dự án tổng hợp hơn là một tập hợp các bản thu. Âm nhạc vẫn là yếu tố cốt lõi, nhưng sự thành công của một album ngày càng phụ thuộc vào khả năng phối hợp giữa sáng tạo, chiến lược phát hành, truyền thông và phát triển thương hiệu. Đó cũng là lý do quy trình làm album hiện đại không còn gói gọn trong phòng thu, mà trải rộng qua nhiều bộ phận khác nhau của ngành công nghiệp âm nhạc.$t43$,
  '/uploads/3935.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-18'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-music-101'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'mot-album-uoc-trien-khai-nhu-the-nao-trong-nganh-cong-nghiep-am-nhac-hien-ai' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCMusic101', '#Album')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'pjpo-va-hanh-trinh-131km-ban-anh-hung-ca-cua-ai-tuong-mien-tay',
  $t45$PJPO và hành trình "131KM": Bản anh hùng ca của "Đại tướng Miền Tây"$t45$,
  $t44$PJPO – 131KM không đơn thuần là một album, mà là hành trình được kể lại bằng âm nhạc, nơi mỗi kilomet đều mang theo một câu chuyện.$t44$,
  $t46$https://youtu.be/zmnqtBpew9U?si=Q4YZ1gnqLMMo2cRZ

Trong bức tranh ngày càng đa dạng của rap Việt, **131KM** của PJPO (Nguyễn Cao Kỳ) là một trong những album đáng chú ý của năm 2025. Phát hành ngày 28/6/2025 dưới nhãn 12 Trái Lê, dự án kéo dài hơn 65 phút với khoảng 21–23 ca khúc (tùy phiên bản) không chỉ đánh dấu một cột mốc trong sự nghiệp của PJPO, mà còn là bản tổng kết cho hành trình hơn 15 năm theo đuổi hip hop của một rapper đến từ miền Tây.

## Hai mặt của một hành trình

Điểm đặc biệt của **131KM** nằm ở cấu trúc được chia thành hai phần rõ rệt: **đĩa đen** và **đĩa trắng**. Hai nửa đối lập này không chỉ tạo nên bố cục cho album mà còn phản chiếu hai giai đoạn trong hành trình trưởng thành của PJPO.

Đĩa đen mở ra bằng những lát cắt gai góc của tuổi trẻ: cảm giác lạc lõng khi rời quê hương, những va vấp đầu đời, mâu thuẫn nội tâm và áp lực của cuộc sống. Những ca khúc như _TAY KHÔNG_, _Sần Sùi_ (ft. $A Milo, Liêm Hiếu), _Bad News_ (ft. 7dnight, LK), _Đau Lòng_, _500MG_, _Cần Số_, _Riêng Em Biết_, _Người Anh Em_, _2 Mặt_ và _Drill Bằng Tiếng Việt_ mang đậm tinh thần raw với drill beat mạnh mẽ, flow giàu kỹ thuật cùng lối chơi chữ và nói lái vốn đã trở thành dấu ấn của PJPO.

Trái ngược với không khí nặng nề ở nửa đầu, đĩa trắng mang màu sắc tích cực và trưởng thành hơn. Các ca khúc như _Back To Westside_, _Quê Hương_, _Quá Lâu_ (ft. VCC Left Hand), _On My Level_, _Tới Lấy_, _Lo Gia Đình Thương Anh Em_, _MAMAMA_, _Em Cứ Ăn Mặc Đẹp_ (ft. Lil Wuyn), _Bum Bum Bum_, _May Mắn_ cùng bonus track _Tín Đồ_ khắc họa hành trình trở về với gia đình, quê hương và những giá trị đã nuôi dưỡng con người PJPO.

> Tên gọi **131KM** cũng gợi mở nhiều tầng ý nghĩa. Dù có thể bắt nguồn từ một khoảng cách địa lý – như quãng đường giữa Vĩnh Long và TP.HCM hoặc một dấu mốc mang tính cá nhân – con số này vẫn được hiểu như biểu tượng cho quãng đường trưởng thành, nơi mỗi kilomet đều được đánh đổi bằng trải nghiệm, thất bại và sự trưởng thành.

## Một dự án của tập thể

Dù là album cá nhân, **131KM** vẫn mang đậm tinh thần cộng đồng. PJPO quy tụ nhiều nghệ sĩ đến từ các khu vực khác nhau như $A Milo, Liêm Hiếu, 7dnight, LK, S.O, Crank D, MC ILL, Soonerr, Lucky$outh, VCC Left Hand, Freaky, Hale, Lil Wuyn và Billy100.

Phần âm nhạc được đảm nhiệm bởi đội ngũ producer gồm VIZZA (mastering), Tuann, 9z, DONAL, Thobeat, Beerus, Nico, CLOUDEE, Ugli và KAIVUADAUBEAT. Sự kết hợp này tạo nên một tổng thể đa dạng, từ drill, melodic rap đến những bản nhạc giàu cảm xúc, đồng thời vẫn giữ được chất riêng trong cách viết và cách rap của PJPO.

## Dấu ấn của Westside

Là đồng sáng lập OTĐ (Original Tây Đô) và thành viên của Tổ Quạ (Crow On Hyenas), PJPO từ lâu đã được xem là một trong những gương mặt có ảnh hưởng của rap miền Tây. **131KM** tiếp tục khẳng định bản sắc ấy thông qua những chủ đề xuyên suốt như tình anh em, quê hương, sự kiên cường và niềm tin vào những giá trị đã gắn bó với anh từ những ngày đầu.

Album cũng cho thấy tinh thần tiên phong khi được phát hành dưới dạng NFT trên nền tảng Dagora – một trong những dự án hiếm hoi tại Việt Nam kết hợp phát hành âm nhạc với công nghệ Web3. Cùng với phần hình ảnh do Trần Nguyễn Phương Tín thực hiện, bộ merch Urban Monkey$ và các MV được đầu tư chỉn chu, **131KM** vượt khỏi khuôn khổ của một album thông thường để trở thành một dự án nghệ thuật có định hướng rõ ràng.

Có thể **131KM** không phải là album hướng đến tiêu chí thương mại hay đại chúng, nhưng đây là một dự án giàu cảm xúc, nhất quán về chủ đề và mang đậm dấu ấn cá nhân của PJPO. Album nhắc người nghe rằng rap Việt không chỉ được tạo nên từ những bản diss hay những màn flex, mà còn từ những câu chuyện đời thường, những hành trình trưởng thành và những giá trị về gia đình, quê hương và tình anh em.

Nếu đang tìm kiếm một album rap Việt vừa giàu năng lượng, vừa chứa đựng nhiều trải nghiệm cá nhân, **131KM** là một trong những dự án đáng nghe của năm 2025. Một lần nữa, PJPO chứng minh anh không chỉ là "đại tướng Miền Tây", mà còn là một storyteller biết cách biến từng chặng đường của cuộc đời thành âm nhạc.

**Đánh giá: 8.5/10** **(Bởi TNC)**$t46$,
  '/uploads/3747.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 2, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-records'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'pjpo-va-hanh-trinh-131km-ban-anh-hung-ca-cua-ai-tuong-mien-tay' and t.deleted_at is null
  and t.name in ('#TNC', '#Records', '#Pjpo', '#131km', '#Lamar')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'rap-viet-a-lon-hon-nhung-he-sinh-thai-van-chua-theo-kip',
  $t48$Rap Việt đã lớn hơn, nhưng hệ sinh thái vẫn chưa theo kịp$t48$,
  $t47$Một trong những nguyên nhân dễ nhận thấy nhất nằm ở cơ sở hạ tầng. Cho đến nay, Việt Nam gần như chưa có một venue được xây dựng chuyên biệt cho hip hop.$t47$,
  $t49$Nhìn từ bề ngoài, rap Việt chưa bao giờ sôi động như hiện nay. Những chương trình truyền hình, các concert cá nhân, festival và hàng triệu lượt nghe trên nền tảng số khiến nhiều người tin rằng hip hop Việt Nam đã bước sang một giai đoạn phát triển hoàn toàn mới. Tuy nhiên, nếu nhìn sâu hơn vào đời sống của cộng đồng underground, một câu hỏi vẫn luôn được đặt ra: vì sao sau nhiều năm bùng nổ, rap Việt vẫn thiếu những sân chơi đủ lớn và đủ bền vững để nuôi dưỡng nghệ sĩ?

Một trong những nguyên nhân dễ nhận thấy nhất nằm ở cơ sở hạ tầng. Cho đến nay, Việt Nam gần như chưa có một venue được xây dựng chuyên biệt cho hip hop. Phần lớn các đêm diễn underground vẫn phải tổ chức trong quán bar, club, quán cà phê hoặc những không gian được cải tạo tạm thời. Điều này không chỉ giới hạn trải nghiệm của khán giả mà còn khiến các đơn vị tổ chức phải đối mặt với nhiều áp lực về chi phí, kỹ thuật và kiểm duyệt. Ngoài Hà Nội và TP.HCM, cơ hội biểu diễn của rapper tại nhiều địa phương vẫn còn rất hạn chế.

Trong khi đó, những sân chơi hiện có vẫn chủ yếu được duy trì nhờ nỗ lực của các cộng đồng độc lập. Ở miền Bắc, những cái tên như DISSNEELAND, One Rounder hay Var Tender tiếp tục giữ lửa cho văn hóa battle rap. Hipfest Vietnam tạo ra không gian kết nối giữa rap với breaking, DJ và graffiti. Các chương trình như School Fest hay những concert cá nhân của nghệ sĩ mang rap đến gần hơn với công chúng. Tuy nhiên, phần lớn những hoạt động này vẫn mang tính sự kiện, phụ thuộc nhiều vào nguồn tài trợ hoặc khả năng bán vé, thay vì trở thành những thiết chế văn hóa có khả năng vận hành lâu dài.

Sự phát triển mạnh của rap trên truyền hình cũng tạo nên một nghịch lý. Các chương trình như _Rap Việt_ giúp thể loại này tiếp cận hàng triệu khán giả mới, nhưng đồng thời cũng khiến nhiều người mặc định rằng rap chỉ tồn tại trong khuôn khổ của một cuộc thi hoặc những bản hit có tính giải trí cao. Trong khi đó, nhiều rapper underground theo đuổi battle, lyricism hay những thử nghiệm nghệ thuật lại không dễ tìm được không gian để phát triển. Khoảng cách giữa underground và mainstream vì thế vẫn chưa thực sự được thu hẹp.

Bên cạnh những yếu tố về thị trường, văn hóa thưởng thức cũng là một bài toán. Khán giả Việt đã quen với việc nghe nhạc trên nền tảng số, nhưng thói quen mua vé để ủng hộ những đêm diễn underground vẫn chưa phổ biến. Điều này khiến nhiều sự kiện khó duy trì đều đặn, đồng thời làm giảm động lực để các nhà tổ chức đầu tư dài hạn. Một hệ sinh thái âm nhạc không thể phát triển chỉ bằng nghệ sĩ; nó còn cần khán giả, địa điểm, đơn vị tổ chức, truyền thông và những mô hình kinh tế đủ bền vững để tất cả cùng tồn tại.

Dẫu vậy, vẫn có những tín hiệu tích cực. Sự xuất hiện của các battle league, festival độc lập và những cộng đồng hoạt động bền bỉ trong nhiều năm cho thấy hip hop Việt Nam vẫn đang tự tìm cách phát triển từ bên trong. Có thể rap Việt chưa thiếu nghệ sĩ tài năng, nhưng vẫn cần thêm nhiều không gian để họ được biểu diễn, cạnh tranh, thử nghiệm và trưởng thành. Khi những "sân chơi" ấy được xây dựng một cách ổn định, sự phát triển của rap Việt sẽ không còn phụ thuộc vào một chương trình truyền hình hay một xu hướng nhất thời, mà được nâng đỡ bởi chính một hệ sinh thái đủ mạnh để nuôi dưỡng thế hệ tiếp theo.

Nếu muốn bước sang một giai đoạn phát triển mới, rap Việt có lẽ cần thay đổi cách nhìn về khái niệm "sân chơi". Một hệ sinh thái bền vững không chỉ được tạo nên bởi những chương trình truyền hình hay các concert quy mô lớn, mà còn cần những không gian biểu diễn thường xuyên, các giải battle chuyên nghiệp, festival độc lập, hệ thống đào tạo, cộng đồng sáng tạo và mạng lưới kết nối giữa nghệ sĩ, nhà tổ chức, truyền thông cùng khán giả.

Bên cạnh đó, các label, rap crew và những nghệ sĩ đã có vị thế trong thị trường cũng có thể đóng vai trò quan trọng hơn trong việc xây dựng cộng đồng. Việc đầu tư vào những sân khấu nhỏ, workshop, cypher, open mic hay các chương trình phát hiện tài năng sẽ tạo ra cơ hội cho lớp nghệ sĩ kế tiếp thay vì chỉ tập trung vào những dự án thương mại ngắn hạn. Đây cũng là mô hình mà nhiều thị trường hip hop phát triển trên thế giới đã duy trì trong nhiều năm.

Quan trọng hơn, sự phát triển của một nền rap không thể chỉ phụ thuộc vào nghệ sĩ. Khán giả cũng là một phần của hệ sinh thái. Khi người nghe sẵn sàng mua vé, tham gia sự kiện, ủng hộ các sản phẩm độc lập và đồng hành cùng những dự án dài hạn, họ không chỉ đang hỗ trợ một nghệ sĩ, mà còn góp phần duy trì toàn bộ cộng đồng phía sau.

Rap Việt đã chứng minh rằng mình có đủ tài năng để tạo nên những nghệ sĩ nổi bật. Thách thức của giai đoạn tiếp theo không còn là tìm kiếm thêm ngôi sao, mà là xây dựng một hệ sinh thái đủ vững chắc để những thế hệ mới luôn có nơi bắt đầu, có không gian phát triển và có cơ hội tồn tại lâu dài.$t49$,
  '/uploads/3897.jpg', 'Cơm Tấm Sài Gòn Show',
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-13'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-breakdown'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'rap-viet-a-lon-hon-nhung-he-sinh-thai-van-chua-theo-kip' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCBreakdown', '#Lamar')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'southside-va-northside-hai-dong-chay-ang-cung-inh-hinh-rap-viet',
  $t51$Southside và Northside: Hai dòng chảy đang cùng định hình rap Việt$t51$,
  $t50$Sau hơn hai thập kỷ phát triển, rap Việt đang bước vào giai đoạn mà ranh giới giữa Southside và Northside ngày càng linh hoạt.$t50$,
  $t52$Lịch sử hip hop luôn được tạo nên bởi nhiều trung tâm văn hóa khác nhau. Tại Mỹ, East Coast và West Coast phát triển những hệ giá trị, âm thanh và tư duy sáng tác riêng, tạo nên một trong những cuộc đối thoại quan trọng nhất của hip hop thế giới. Rap Việt không lặp lại hoàn toàn câu chuyện đó, nhưng trong quá trình phát triển, sự khác biệt giữa **Southside** và **Northside** cũng dần hình thành như hai dòng chảy mang những bản sắc riêng.

Miền Nam là nơi rap Việt sớm tìm được điểm kết nối với thị trường đại chúng. Từ diễn đàn lequydon, GODZ,  G-Family, FSR, Tổ Quạ cho đến những thế hệ sau này, nhiều nghệ sĩ lựa chọn mở rộng ngôn ngữ hip hop bằng việc kết hợp rap với R&B, pop và những màu sắc dễ tiếp cận hơn. Storytelling, melody, những câu chuyện về cuộc sống, tình yêu, gia đình hay tinh thần của một rap crew xuất hiện với tần suất ngày càng nhiều. Song song với đó là sự phát triển của các big track, cypher và những concert quy mô lớn, góp phần đưa rap bước ra khỏi cộng đồng underground để tiếp cận lượng khán giả rộng hơn.

Trong khi đó, cộng đồng miền Bắc lại phát triển theo một hướng khác. Battle rap, lyricism và kỹ thuật viết lời luôn giữ vị trí trung tâm trong quá trình hình thành của nhiều rapper. Từ nhũng cộng đồng GVR, LadyKillah, Darapclub, anhemrap đến những sân chơi như DISSNEELAND, One Rounder hay các cộng đồng battle độc lập tạo nên môi trường nơi khả năng sử dụng ngôn ngữ, tư duy phản biện và kỹ thuật gieo vần thường được đặt lên hàng đầu. Với nhiều nghệ sĩ, rap không chỉ là âm nhạc mà còn là một hình thức đối thoại thông qua ngôn từ.

Chính vì vậy, nhiều người thường liên hệ Southside với West Coast và Northside với East Coast của hip hop Mỹ. Đây là một cách so sánh thú vị để hình dung sự khác biệt về xu hướng phát triển, nhưng cũng cần được nhìn nhận như một phép đối chiếu hơn là sự tương đồng tuyệt đối. Rap miền Nam không chỉ có melody hay tính giải trí, cũng như rap miền Bắc không chỉ xoay quanh battle và lyricism. Trong cả hai cộng đồng đều tồn tại nhiều ngoại lệ, nhiều nghệ sĩ liên tục dịch chuyển giữa các phong cách và góp phần làm mờ đi ranh giới vốn đã không quá rõ ràng.

Điều đáng chú ý là sự khác biệt này hiếm khi trở thành một cuộc đối đầu theo nghĩa tiêu cực. Nếu East Coast và West Coast từng trải qua giai đoạn xung đột gay gắt trong lịch sử hip hop Mỹ, thì rap Việt chủ yếu chứng kiến những khác biệt về tư duy sáng tác, cách xây dựng cộng đồng và định hướng phát triển. Các nghệ sĩ từ hai miền vẫn thường xuyên hợp tác, xuất hiện trong cùng những dự án hoặc cùng chia sẻ sân khấu, tạo nên một bức tranh đa dạng hơn là đối lập.

Nhiều trận beef đã trở thành những dấu mốc của cộng đồng underground với sự góp mặt của các nhóm và nghệ sĩ thuộc nhiều thế hệ khác nhau. Những cuộc đối đầu giữa GVR, GoDz, G-Family, HLBz, SSR hay nhiều battle rapper độc lập đã góp phần tạo nên một giai đoạn cạnh tranh khốc liệt, nơi mỗi diss track đều trở thành phép thử về kỹ thuật viết lời, tư duy phản biện và bản lĩnh của nghệ sĩ. Trong nhiều trường hợp, yếu tố "Bắc – Nam" chỉ là một phần của câu chuyện, trong khi nguyên nhân cốt lõi vẫn là những mâu thuẫn cá nhân hoặc khác biệt về quan điểm trong cộng đồng.

Nhìn từ góc độ lịch sử, các cuộc beef này cũng mang lại nhiều tác động tích cực. Chúng thúc đẩy rapper đầu tư hơn vào lyricism, kỹ thuật gieo vần, storytelling và khả năng xây dựng lập luận trong từng câu rap. Nhiều diss track ngày nay được xem như những tư liệu quan trọng phản ánh quá trình phát triển của underground Việt Nam, hơn là những màn công kích đơn thuần.

Bước sang giai đoạn hiện tại, các nghệ sĩ từ hai miền thường xuyên hợp tác trong album, concert và festival, trong khi những cuộc beef quy mô lớn giữa các cộng đồng không còn xuất hiện với tần suất như trước. Điều còn lại từ giai đoạn ấy không phải là sự chia rẽ, mà là một di sản về tính cạnh tranh, tinh thần không ngừng hoàn thiện kỹ năng và khát vọng khẳng định bản sắc – những giá trị vẫn tiếp tục ảnh hưởng đến rap Việt cho đến hôm nay.

Sau hơn hai thập kỷ phát triển, rap Việt đang bước vào giai đoạn mà ranh giới giữa Southside và Northside ngày càng linh hoạt. Nhiều rapper miền Nam đầu tư nhiều hơn cho lyricism, trong khi không ít nghệ sĩ miền Bắc cũng mở rộng âm nhạc theo hướng dễ tiếp cận hơn với công chúng. Sự giao thoa ấy cho thấy bản sắc vùng miền không phải là giới hạn, mà là nền tảng để mỗi nghệ sĩ tiếp tục phát triển theo cách riêng của mình.

Có lẽ, câu hỏi quan trọng hiện nay không còn là miền nào mạnh hơn miền nào. Điều đáng quan tâm hơn là làm thế nào để hai dòng chảy ấy cùng tồn tại, đối thoại và bổ sung cho nhau. Chính sự đa dạng về tư duy, kỹ thuật và văn hóa mới là yếu tố giúp rap Việt tiếp tục phát triển, thay vì bị giới hạn trong một khuôn mẫu duy nhất. Đó cũng là điều đã luôn tồn tại trong lịch sử của hip hop: những khác biệt không làm suy yếu nền văn hóa, mà tạo nên động lực để nó không ngừng tiến về phía trước.$t52$,
  '/uploads/3932.jpg', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 1, null,
  '[]'::jsonb,
  '2026-07-16'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-breakdown'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'southside-va-northside-hai-dong-chay-ang-cung-inh-hinh-rap-viet' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCBreakdown', '#Southside', '#Northside')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'tnc-community-he-sinh-thai-danh-rieng-cho-nhung-nguoi-ban-cua-the-new-culture',
  $t54$TNC Community - Hệ sinh thái "dành riêng" cho những người bạn của The New Culture$t54$,
  $t53$TNC Community là hệ sinh thái cộng đồng chính thức của The New Culture, được xây dựng trên nền tảng Discord.$t53$,
  $t55$Ngay từ những ngày đầu, The New Culture không được xây dựng chỉ để trở thành một nơi đăng tải bài viết.

Chúng tôi luôn tin rằng, một tạp chí chỉ thật sự có ý nghĩa khi có một cộng đồng cùng đọc, cùng trao đổi và cùng tạo ra giá trị. Bài viết có thể kết thúc sau vài phút, nhưng những cuộc trò chuyện phía sau nó mới là điều giúp một nền văn hóa tiếp tục phát triển.

Đó là lý do **TNC Community** được hình thành.

TNC Community là hệ sinh thái cộng đồng chính thức của The New Culture, được xây dựng trên nền tảng Discord với mong muốn kết nối những người đang quan tâm đến underground và công nghiệp âm nhạc Việt Nam. Đây không chỉ là nơi để cập nhật bài viết mới, mà còn là không gian để mọi người cùng chia sẻ góc nhìn, thảo luận về âm nhạc, văn hóa, nghệ sĩ, sản phẩm và những chuyển động đang diễn ra trong cộng đồng.

Trong thời gian tới, TNC Community sẽ từng bước mở rộng với nhiều hoạt động như các buổi thảo luận chuyên đề, workshop, listening session, Q&A, networking, giao lưu cùng nghệ sĩ, producer và những người đang trực tiếp làm việc trong ngành. Bên cạnh đó, đây cũng sẽ là nơi cập nhật sớm những dự án, series và hoạt động mới của The New Culture trước khi được công bố rộng rãi.

Chúng tôi mong muốn xây dựng một cộng đồng nơi mọi người có thể trao đổi trên tinh thần tôn trọng lẫn nhau, cởi mở với những góc nhìn khác biệt và cùng nhau tạo nên những cuộc thảo luận có giá trị. Dù bạn là nghệ sĩ, producer, photographer, designer, sinh viên, nhà nghiên cứu hay đơn giản chỉ là một người yêu hip hop, bạn đều có chỗ đứng trong cộng đồng này.

The New Culture sẽ tiếp tục kể những câu chuyện thông qua các bài viết. Còn TNC Community sẽ là nơi những câu chuyện ấy được tiếp tục bằng những cuộc trò chuyện giữa chính những người đang tạo nên và yêu mến nền văn hóa này.

**Chào mừng bạn đến với TNC Community.**

**Discord:** _https://discord.gg/ybsek3eEm_$t55$,
  '/uploads/3749.png', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 3, null,
  '[]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-community'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'tnc-community-he-sinh-thai-danh-rieng-cho-nhung-nguoi-ban-cua-the-new-culture' and t.deleted_at is null
  and t.name in ('#TNC', '#TNCCommunity', '#Lamar')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'tnc-selects-tuan-nay',
  $t57$TNC SELECTS THÁNG 7$t57$,
  $t56$BẢNG XẾP HẠNG THÁNG 7/2026$t56$,
  $t58$TNC SELECTS tuần này có gì? Chúng ta hãy cùng đón xem nhé.$t58$,
  '/uploads/3746.png', null,
  auth.id, ser.id, null, 'published', false, false,
  0, 2, null,
  '[{"song": "Slippery", "artist": "MCK ft. Tùng Dương", "cover": "", "youtube": "28SGMOdKdUo", "note": "", "rank": 1}, {"song": "Come my way", "artist": "Sơn Tùng M-TP ft. Tyga", "cover": "", "youtube": "SlQR9iu09bQ", "note": "", "rank": 2}, {"song": "Tag khỉ", "artist": "Yung Ni99", "cover": "", "youtube": "3gOINvQo7Qc", "note": "", "rank": 3}, {"song": "Wassup bro", "artist": "Anh Phan ft. Lil Đến", "cover": "", "youtube": "CzIchahh5s0", "note": "", "rank": 4}, {"song": "Vacheron Louie V", "artist": "HIEUTHUHAI ft. Hustlang Robber", "cover": "", "youtube": "UUGScGFbPxk", "note": "", "rank": 5}, {"song": "Anh tên là", "artist": "Anh Bằng ft. NHI$M, Ann Nguyễn", "cover": "", "youtube": "Iz2-sUY91_c", "note": "", "rank": 6}]'::jsonb,
  '2026-07-10'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'tnc-selectas' and ser.slug = 'tnc-selects'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'tnc-selects-tuan-nay' and t.deleted_at is null
  and t.name in ('#TNCSELECTS')
on conflict do nothing;

insert into public.articles (
  slug, title, dek, body, cover_image_url, cover_credit,
  author_id, series_id, category_id, status, featured, hero_priority,
  read_time_minutes, sort_order, poster_image_url, ranking, published_at
)
select 'viet-dragon-vd-vi-vua-gangsta-rap-viet-nam-va-di-san-bat-diet-cua-viet-rap',
  $t60$Viet Dragon: "VD là Ví Dụ của Rap Việt"$t60$,
  $t59$Viet Dragon không chỉ là rapper; anh là biểu tượng của văn hoá Hiphop, sáng tạo không ngừng và là tượng đài không thể nào thay thế.$t59$,
  $t61$TÊN THẬT VÀ NGUỒN GỐC

Trương Hoàng Minh Huy, thường được biết đến với nghệ danh Viet Dragon (hay VD, Rồng Việt, SSK – Southside King, King of VietRap, Vua cả ba miền), sinh ngày 17 tháng 10 năm 1979 tại Sài Gòn, Việt Nam (một số nguồn ghi 23/08/1979, nhưng đa số tài liệu đáng tin cậy xác nhận ngày 17/10). Anh là con của một gia đình có bố người miền Trung và mẹ người miền Bắc, lớn lên trong khu người Hoa quận 5 (gần Chợ Hòa Bình, đường Nghĩa Thục).

Năm 1992, khi mới 13 tuổi, gia đình anh di cư sang Úc và định cư tại Perth, Tây Úc. Anh mang quốc tịch Úc và sống giữa hai nền văn hóa: gốc Việt Nam và môi trường Hip-Hop phương Tây sôi động. Chính tại đây, Viet Dragon tiếp xúc và đắm chìm trong văn hóa Hip-Hop, sau này trở thành nền tảng cho sự nghiệp của mình.

HÀNH TRÌNH BƯỚC VÀO RAP VIỆT

> Viet Dragon nổi lên như một trong những rapper tiên phong của thế hệ F1-F2 trong cộng đồng Rap Việt, đặc biệt từ khoảng năm 2005-2006 trên diễn đàn vietrapper.com – “cái nôi” của Rap Việt. Ban đầu, flow và lyric của anh còn thô sơ, nhưng anh nhanh chóng tiến bộ vượt bậc nhờ sự đam mê mãnh liệt và khả năng sáng tác, sản xuất nhạc cực kỳ nhanh (thường chỉ mất 1-2 giờ để hoàn thiện một track).

Anh chủ yếu theo phong cách Gangsta Rap (Gangz) – dòng nhạc đường phố, mạnh mẽ, phản ánh cuộc sống thực tế, xã hội, và thường gắn liền với diss (dizz), battle. VD được đánh giá cao về flow, lyric, skill; nhiều người coi anh là “không ai bằng” khi lên mic diss. Anh không chỉ rap về beef mà còn sáng tác những track đời thường, tình yêu, và yêu nước như Welcome to Saigon, I Love Phở, Orange, Đi Việt Nam.

SỰ NGHIỆP VÀ "LẮM TÀI NHIỀU TẬT"

Toàn bộ sự nghiệp của Viet Dragon gắn liền với beef và battle. Anh diss hầu hết các rapper và nhóm lớn thời bấy giờ như GVR, LadyKillar (vụ diss đình đám với LK), SSR, G Family... Nhiều thành viên các nhóm này từng học rap từ anh. Anh tự nhận “VD là Ví Dụ của Rap Việt” và coi rap như cuộc sống, sẵn sàng tranh đấu để khẳng định vị thế.

Là rapper Gangz hàng đầu, anh mang đến những track kỹ thuật cao, lyric “bác học”, đôi khi khó hiểu nếu không nghe kỹ. Anh còn hoạt động đa dạng: rapper, nhà soạn nhạc, giảng viên thanh nhạc, thông dịch viên, và làm việc tại sở An sinh Xã hội Úc. Anh từng feat với nhiều nghệ sĩ underground và để lại kho tàng nhạc phong phú, từ diss cay nghiệt đến những bản rap yêu quê hương sâu sắc.

Tuy nhiên, phong cách ngang ngược, nhiều tai tiếng và scandal khiến anh bị một bộ phận khán giả “ruồng bỏ” lúc sinh thời. Dù vậy, những ai hiểu sâu về rap underground đều công nhận tài năng và sự cống hiến của anh cho nền móng Viet Rap. Anh được xem là “người kiến tạo vĩ đại nhất”, “kẻ phản diện vĩ đại” nhưng có sứ mệnh cao cả trong việc đẩy mạnh tinh thần battle và kỹ thuật rap.

CUỘC SỐNG CÁ NHÂN VÀ NGÀY RA ĐI

Viet Dragon sống giữa Việt Nam và Úc, mang trong mình bản sắc “con lai văn hóa” – sinh ra miền Nam, gốc gác ba miền, trưởng thành ở nước ngoài. Anh là người nhiệt huyết, quan tâm cộng đồng, nhưng cũng đầy mâu thuẫn và “điên rồ” theo cách của một nghệ sĩ thực thụ.

Ngày 10 tháng 8 năm 2012, Viet Dragon qua đời ở tuổi 32-33 (hưởng dương 33 tuổi). Tin tức ban đầu bị nghi ngờ vì trước đó đã có tin đồn giả, nhưng sau khi được xác nhận bởi người thân và cộng đồng (qua Linh Lam và các nguồn uy tín), cả Viet Hip-Hop bàng hoàng. Cơn mưa lớn vào ngày tang lễ được nhiều người xem như trời đất tưởng nhớ vị vua.

CÁC SẢN PHẨM TIÊU BIỂU

VIETDRAGON - SOUTH SIDE KING

https://youtu.be/20925tVFsfo?si=sFFuhBY0cOU_zhJU

VIETDRAGON - TỨ PHƯƠNG BẤT BẠI

https://youtu.be/SBNl36H6VfU?si=dJkvnUBVeQJDMudm

VIETDRAGON FT. DSK, ANDREE, PHUONGCD - THE GOOD DIE YOUNG

https://youtu.be/tUwPDPxv5sA?si=var7tzbQ_-EeeUdp

VIETDRAGON FT. ACY - 1008

https://youtu.be/cGmpo5Ye7PM?si=9fr-fk9MdCLKZbZ5

DI SẢN VÀ ẢNH HƯỞNG

Dù ra đi sớm, di sản của Viet Dragon vẫn sống mãi trong cộng đồng Rap Việt. Anh được shout-out bởi rất nhiều rapper sau này, từ underground đến mainstream. Các track của anh vẫn được nghe, remix, và phân tích. Nhiều video tưởng niệm, thread “Big Thread” trên diễn đàn, và clip “Ngôi Đền Huyền Thoại” tôn vinh anh như một huyền thoại.

Viet Dragon không chỉ là rapper; anh là biểu tượng của tinh thần bất khuất, sáng tạo không ngừng và lòng yêu rap chân thành. Từ một cậu bé Việt kiều ở Perth đến “Southside King” – Vua Rap Việt, hành trình của anh là minh chứng cho sức mạnh của đam mê và tài năng nguyên thủy. Hàng chục năm sau, khi Rap Việt ngày càng phát triển, người ta vẫn nhắc đến VD như người đã đổ nền móng cho dòng Gangz, battle culture, và tinh thần underground đích thực.

Rest in Peace, Viet Dragon a.k.a. VD a.k.a. SSK – King of VietRap. Di sản của anh vẫn tiếp tục truyền cảm hứng cho thế hệ rapper Việt Nam hôm nay và mai sau.$t61$,
  '/uploads/3642.png', null,
  auth.id, ser.id, null, 'published', false, false,
  5, 1, null,
  '[]'::jsonb,
  '2026-07-01'::date::timestamptz at time zone 'Asia/Ho_Chi_Minh'
from public.authors auth, public.series ser
where auth.slug = 'lamar' and ser.slug = 'tnc-origins'
on conflict (slug) where deleted_at is null do nothing;
insert into public.article_tags (article_id, tag_id)
select art.id, t.id from public.articles art, public.tags t
where art.slug = 'viet-dragon-vd-vi-vua-gangsta-rap-viet-nam-va-di-san-bat-diet-cua-viet-rap' and t.deleted_at is null
  and t.name in ('#Vietdragon #TNCOrigins #Lamar')
on conflict do nothing;
