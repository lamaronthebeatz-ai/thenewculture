# TNC Platform v2.0 — Database Documentation

Schema PostgreSQL cho TNC Platform v2.0, thiết kế để chạy trên **Supabase Postgres**. Tài liệu này mô tả từng bảng, từng cột, quan hệ giữa các bảng, quy tắc đặt tên, và quy tắc mở rộng schema trong tương lai.

**File liên quan trong `database/`:**
| File | Vai trò |
|---|---|
| `schema.sql` | DDL đầy đủ — chạy đầu tiên, một lần (an toàn chạy lại nhiều lần nhờ `IF NOT EXISTS`/`OR REPLACE`). |
| `seed.sql` | Dữ liệu mẫu bám theo hệ thống The New Culture thật — chạy sau `schema.sql`. |
| `test.sql` | Bộ kiểm thử ràng buộc + tính hợp lý dữ liệu seed — chạy sau `seed.sql`. |
| `DATABASE_DOCUMENTATION.md` | Tài liệu này. |

Thứ tự chạy chuẩn trong SQL Editor của Supabase: **`schema.sql` → `seed.sql` → `test.sql`**.

---

## 1. Tổng quan

7 bảng lõi, chia làm 2 nhóm:

- **Bảng thực thể (entity):** `authors`, `categories`, `series`, `tags`, `articles`, `media`
- **Bảng quan hệ (join):** `article_tags`

Mọi bảng thực thể đều có bộ 3 cột chuẩn: `created_at`, `updated_at` (tự động cập nhật qua trigger), `deleted_at` (soft delete). Khóa chính dùng `uuid` (`gen_random_uuid()`, cần extension `pgcrypto`).

---

## 2. Mô tả từng bảng

### 2.1 `authors` — Biên tập viên / tác giả

Lưu thông tin biên tập viên: vai trò, vinh danh, huy hiệu, tiểu sử.

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | Khóa chính. |
| `slug` | `text` | NOT NULL, unique (partial, xem §2.8) | Định danh dùng trong URL, vd `lamar`. |
| `name` | `text` | NOT NULL | Tên hiển thị. |
| `email` | `text` | unique (partial), CHECK định dạng email | Có thể để trống; nếu có phải đúng định dạng `x@y.z`. |
| `avatar_url` | `text` | — | Đường dẫn ảnh đại diện. |
| `bio` | `text` | — | Tiểu sử/giới thiệu. |
| `role` | `text` | NOT NULL, CHECK enum, default `'editor'` | Một trong: `editor-in-chief`, `deputy-editor`, `managing-editor`, `senior-editor`, `editor`, `contributor`, `guest`. |
| `honor` | `text` | — | Vinh danh chính (id tự do, vd `nguoi-sang-lap`). Không có bảng registry riêng — xem §5 nếu cần chuẩn hoá. |
| `badges` | `jsonb` | NOT NULL, default `'[]'`, CHECK phải là mảng | Danh sách id huy hiệu, vd `["founder","hiphop-expert"]`. |
| `is_active` | `boolean` | NOT NULL, default `true` | Cờ bật/tắt hiển thị công khai (dùng trong policy RLS `authors`). |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | xem §2.9 | Chuẩn 3 cột thời gian. |

**Index:** unique partial trên `slug`, `email`; index thường trên `deleted_at`, `role`.

### 2.2 `categories` — Chuyên mục

Phân loại nội dung theo mảng chuyên môn (Âm nhạc, Văn hóa, Tin tức...), hỗ trợ phân cấp cha-con.

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `parent_id` | `uuid` | FK tự tham chiếu `categories.id`, `ON DELETE SET NULL`, CHECK khác chính nó | Chuyên mục cha (tuỳ chọn) — cho phép cây phân cấp. |
| `slug` | `text` | NOT NULL, unique (partial) | |
| `name` | `text` | NOT NULL | |
| `description` | `text` | — | |
| `sort_order` | `integer` | NOT NULL, default `0` | Thứ tự hiển thị. |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

### 2.3 `series` — Tuyến nội dung

Tương ứng đúng 16 series hiện có của The New Culture (TNC Origins, TNC Profiles, ...). Không có FK ra bảng khác; là bảng "gốc" cho `articles.series_id`.

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `slug` | `text` | NOT NULL, unique (partial) | vd `tnc-origins`. |
| `code` | `text` | — | Mã lưu trữ ngắn hiển thị, vd `TNC·01`. |
| `name` | `text` | NOT NULL | vd `TNC Origins`. |
| `description` | `text` | — | |
| `cover_image_url` | `text` | — | Ảnh đại diện series. |
| `accent_color` | `text` | — | Màu nhấn (tự do, vd `red`/`gold`). |
| `sort_order` | `integer` | NOT NULL, default `0` | Thứ tự hiển thị (1–16). |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

### 2.4 `tags` — Từ khóa tự do

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `slug` | `text` | NOT NULL, unique (partial) | |
| `name` | `text` | NOT NULL, unique (partial) | Nhãn hiển thị, vd `#HipHop`. |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

### 2.5 `articles` — Bài viết

Bảng trung tâm, tham chiếu tới `authors`, `series`, `categories`.

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `slug` | `text` | NOT NULL, unique (partial) | |
| `title` | `text` | NOT NULL | |
| `dek` | `text` | — | Tóm tắt ngắn (deck/excerpt). |
| `body` | `text` | — | Nội dung bài viết. |
| `cover_image_url` | `text` | — | |
| `cover_credit` | `text` | — | Ghi nguồn ảnh bìa. |
| `author_id` | `uuid` | **NOT NULL**, FK `authors.id`, `ON DELETE RESTRICT` | Không cho xoá cứng một author còn bài viết — buộc dùng soft delete (`authors.deleted_at`). |
| `series_id` | `uuid` | FK `series.id`, `ON DELETE SET NULL` | Có thể không thuộc series nào. |
| `category_id` | `uuid` | FK `categories.id`, `ON DELETE SET NULL` | Có thể chưa phân loại. |
| `status` | `text` | NOT NULL, CHECK enum, default `'draft'` | `draft` → `review` → `scheduled` → `published` → `archived` (xem §4 quy trình biên tập). |
| `featured` | `boolean` | NOT NULL, default `false` | Đánh dấu bài nổi bật. |
| `hero_priority` | `boolean` | NOT NULL, default `false` | Ưu tiên chọn làm Hero trang chủ. |
| `read_time_minutes` | `integer` | NOT NULL, default `0`, CHECK `>= 0` | |
| `view_count` | `integer` | NOT NULL, default `0`, CHECK `>= 0` | |
| `published_at` | `timestamptz` | CHECK: bắt buộc khi `status='published'` | `scheduled` cũng nên có giá trị (ngày dự kiến đăng) nhưng KHÔNG bị ép buộc bởi CHECK — xem §7 lý do. |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

**Constraint đặc biệt** `articles_published_requires_date`: `status = 'published'` bắt buộc `published_at IS NOT NULL`; mọi status khác không bị ràng buộc này.

### 2.6 `article_tags` — Bảng nối N-N (articles ↔ tags)

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `article_id` | `uuid` | NOT NULL, FK `articles.id`, `ON DELETE CASCADE` | Xoá article → xoá luôn liên kết tag. |
| `tag_id` | `uuid` | NOT NULL, FK `tags.id`, `ON DELETE CASCADE` | Xoá tag (cứng) → xoá luôn liên kết. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Không có `updated_at`/`deleted_at` — bảng nối thuần, không có vòng đời riêng (xem §5). |

**PK:** `(article_id, tag_id)` — một cặp article/tag chỉ xuất hiện đúng 1 lần.

### 2.7 `media` — Thư viện ảnh/video/gif

| Cột | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `url` | `text` | NOT NULL, unique (partial) | |
| `type` | `text` | NOT NULL, CHECK enum | `image`, `gif`, `video`, `audio`, `document`. |
| `alt_text` | `text` | — | |
| `width`/`height` | `integer` | CHECK `> 0` nếu có giá trị | |
| `size_bytes` | `bigint` | CHECK `>= 0` nếu có giá trị | |
| `uploaded_by` | `uuid` | FK `authors.id`, `ON DELETE SET NULL` | Người upload — không bắt buộc. |
| `article_id` | `uuid` | FK `articles.id`, `ON DELETE SET NULL` | Bài viết mà media này gắn vào (nếu có) — media KHÔNG bị xoá khi article bị xoá, chỉ mất liên kết (cho phép tái sử dụng ảnh). |
| `created_at`/`updated_at`/`deleted_at` | `timestamptz` | | |

---

## 3. Quan hệ giữa các bảng

```
authors  1 ──< N  articles          (author_id, ON DELETE RESTRICT)
authors  1 ──< N  media             (uploaded_by, ON DELETE SET NULL)
series   1 ──< N  articles          (series_id,  ON DELETE SET NULL)
categories 1 ──< N articles         (category_id, ON DELETE SET NULL)
categories 1 ──< N categories       (parent_id — tự tham chiếu, phân cấp)
articles 1 ──< N  media             (article_id, ON DELETE SET NULL)
articles N ──< article_tags >── N  tags   (cascade cả 2 chiều)
```

**Quy tắc `ON DELETE` và lý do:**
- **RESTRICT** (`articles.author_id`): một author còn bài viết thì không được xoá cứng — buộc đi qua soft delete (`deleted_at`). Đây là quan hệ "sở hữu nội dung", mất tác giả của một bài viết đã xuất bản là mất mát dữ liệu nghiêm trọng.
- **SET NULL** (`series_id`, `category_id`, `media.uploaded_by`, `media.article_id`): quan hệ phân loại/gắn nhãn, không phải sở hữu — xoá series/category không nên kéo theo xoá bài viết.
- **CASCADE** (`article_tags`): bảng nối thuần, không có ý nghĩa tồn tại độc lập với article/tag mà nó nối.

---

## 4. Quy trình trạng thái bài viết (`articles.status`)

```
draft ──> review ──> scheduled ──> published ──> archived
  ↑                                    │
  └────────────── (có thể quay lại draft để sửa lớn) ──┘
```

- **draft**: đang soạn, chưa gửi duyệt.
- **review**: đã gửi, chờ biên tập duyệt.
- **scheduled**: đã duyệt, đặt lịch đăng (`published_at` nên là thời điểm tương lai).
- **published**: đã công khai (`published_at` bắt buộc, được CHECK constraint ép).
- **archived**: từng công khai, nay gỡ khỏi trang chủ/luồng chính nhưng vẫn giữ URL/lịch sử.

Ứng dụng tầng trên (API) chịu trách nhiệm điều phối việc chuyển trạng thái hợp lệ (vd không cho nhảy thẳng `draft` → `published`) — schema chỉ đảm bảo tính toàn vẹn dữ liệu tối thiểu (giá trị hợp lệ + `published_at` bắt buộc khi `published`), không áp đặt state machine đầy đủ ở tầng CSDL.

---

## 5. Quy tắc đặt tên (Naming Conventions)

- **Bảng:** số nhiều, `snake_case`, tiếng Anh (`authors`, `articles`, `article_tags`).
- **Cột khoá chính:** luôn là `id` (`uuid`).
- **Cột khoá ngoại:** `<tên_bảng_số_ít>_id`, vd `author_id`, `series_id`, `category_id`, `article_id`, `tag_id`, `parent_id` (tự tham chiếu).
- **Cột định danh URL:** luôn tên `slug`, kiểu `text`, unique theo partial index (§2.8).
- **Cột thời gian:** hậu tố `_at` (`created_at`, `updated_at`, `deleted_at`, `published_at`) — không dùng `_date`/`_time`.
- **Cột cờ boolean:** tiền tố ngầm định "is/has" qua ngữ nghĩa rõ ràng (`featured`, `is_active`, `hero_priority`) — nếu thêm cờ mới, ưu tiên tiền tố `is_`/`has_` khi tên không đã tự rõ nghĩa.
- **Index:** `<bảng>_<cột>_idx` (thường), `<bảng>_<cột>_key` (unique).
- **Trigger:** `trg_<bảng>_<hành_động>`, vd `trg_articles_updated_at`.
- **Constraint CHECK đặt tên riêng:** `<bảng>_<mô_tả>` (vd `articles_published_requires_date`) khi constraint có logic phức tạp hơn 1 CHECK đơn giản trong định nghĩa cột.
- **Policy RLS:** mô tả bằng câu tiếng Anh ngắn trong ngoặc kép, dạng `"Public read <bảng>"`.
- **Bảng nối N-N:** ghép tên 2 bảng theo thứ tự alphabet hoặc thứ tự ngữ nghĩa chính-phụ, số ít nối số ít bằng `_`, vd `article_tags` (không phải `articles_tags` hay `tag_articles`).

## 5.1 Ghi chú thiết kế (đã cân nhắc nhưng chưa làm)

- `authors.honor`/`authors.badges` hiện là `text`/`jsonb` tự do (không FK ra bảng registry riêng). Nếu tương lai cần validate chặt id honor/badge hoặc quản lý badge có thuộc tính riêng (màu, độ hiếm, mô tả) — tách thành 2 bảng `honors`/`badges` + 1 bảng nối `author_badges`, xem §6.
- `article_tags` không có `updated_at`/`deleted_at`: một liên kết article↔tag không có "trạng thái" để cập nhật, chỉ có/không có — xoá thật (cascade) là hợp lý, không cần soft delete cho bảng nối thuần.

---

## 6. Quy tắc mở rộng schema trong tương lai

1. **Luôn thêm, hạn chế sửa/xoá.** Thêm cột mới ở cuối bảng bằng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, có `DEFAULT` hợp lý để không phá dữ liệu cũ. Tránh `DROP COLUMN`/đổi kiểu dữ liệu trên bảng đã có dữ liệu production — nếu bắt buộc, đi qua migration 2 bước (thêm cột mới → migrate dữ liệu → ngừng dùng cột cũ → xoá ở lần release sau).

2. **Mọi bảng thực thể mới đều phải có `id uuid PK default gen_random_uuid()`, `created_at`, `updated_at` (+ trigger `set_updated_at`), `deleted_at`** — giữ đúng khuôn mẫu soft-delete đã thiết lập. Không tạo bảng thực thể mới thiếu bộ 3 cột này trừ khi có lý do rõ ràng (vd bảng nối thuần như `article_tags`).

3. **Unique constraint trên cột có thể soft-delete → luôn dùng partial unique index** (`WHERE deleted_at IS NULL`), không dùng `UNIQUE` thường — để cho phép tái sử dụng slug/email sau khi xoá mềm (đã kiểm chứng trong `test.sql`).

4. **Mở rộng enum (CHECK ... IN (...))**: khi cần thêm giá trị mới (vd thêm `role` cho authors, thêm `type` cho media), sửa trực tiếp danh sách trong `CHECK` — đây là thay đổi an toàn, tương thích ngược, không cần migration dữ liệu. **Phải giải thích lý do trước khi sửa** (như đã làm với `articles.status` ở Rev 2) và ghi chú ngay tại vị trí định nghĩa cột trong `schema.sql`.

5. **FK mới**: luôn cân nhắc rõ `ON DELETE` — dùng đúng 3 mức đã thiết lập trong §3 (`RESTRICT` cho quan hệ sở hữu nội dung, `SET NULL` cho quan hệ phân loại/gắn nhãn, `CASCADE` cho bảng nối/dữ liệu phụ thuộc hoàn toàn). Không để mặc định `NO ACTION` mà không cân nhắc.

6. **Bảng mới cần RLS**: mọi bảng public mới phải `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + tối thiểu 1 policy đọc công khai hợp lý (theo mẫu `deleted_at IS NULL AND status = 'published'`), tránh tạo bảng "mở toang" hoặc "khoá cứng không ai đọc được" do quên định nghĩa policy.

7. **Tách bảng registry (honors/badges) nếu cần chuẩn hoá dữ liệu Editor Identity System** — hiện tại `authors.honor`/`authors.badges` là dữ liệu tự do (xem §5.1); nếu triển khai, tạo bảng `honors(id, slug, name, rarity, description, ...)`, `badges(id, slug, name, category, rarity, color, description, ...)`, và bảng nối `author_badges(author_id, badge_id, awarded_at)` — theo đúng khuôn mẫu N-N như `article_tags`.

8. **Không đổi kiểu `id` từ `uuid` sang kiểu khác** (vd `bigint identity`) cho bảng đã có FK trỏ tới — phá vỡ toàn bộ quan hệ. Nếu một bảng mới thực sự cần khoá tuần tự (vd bảng log/audit không cần FK ra ngoài), có thể cân nhắc `bigint generated always as identity`, nhưng đây là ngoại lệ, không phải mặc định.

9. **Viết seed/test kèm theo mọi thay đổi schema** — mở rộng `seed.sql` để phủ dữ liệu cho cột/bảng mới, mở rộng `test.sql` để kiểm tra ràng buộc mới, theo đúng cấu trúc Phần A (kiểm tra dữ liệu seed, chỉ đọc) / Phần B (kiểm tra cơ chế ràng buộc, dữ liệu tạm tự rollback) đã có.

---

## 7. Ghi chú vận hành

- **`now()` trong Postgres = thời điểm bắt đầu transaction**, không đổi trong suốt 1 transaction — cần lưu ý khi viết test hoặc logic nghiệp vụ dựa vào so sánh thời gian trong cùng 1 transaction dài (xem chú thích trong `test.sql`, mục B6).
- **RLS baseline chỉ có policy đọc (SELECT)** — không có policy cho INSERT/UPDATE/DELETE, nghĩa là chỉ `service_role` (bỏ qua RLS mặc định của Supabase) mới ghi được dữ liệu. Khi có hệ thống đăng nhập biên tập viên thật, cần bổ sung policy ghi theo `auth.uid()` tương ứng.
- **RLS dùng `ENABLE` chứ không `FORCE`** — nghĩa là chủ bảng (table owner) và superuser vẫn bỏ qua RLS như mặc định của Postgres. Đây là hành vi chuẩn, phù hợp cho backend chạy bằng `service_role`.
- **`scheduled` chưa có cơ chế tự động chuyển sang `published`** khi tới `published_at` — cần một cron job/Edge Function riêng ở tầng ứng dụng để quét `status='scheduled' AND published_at <= now()` và cập nhật; đây là điều KHÔNG thể (và không nên) làm bằng CHECK constraint thuần.
