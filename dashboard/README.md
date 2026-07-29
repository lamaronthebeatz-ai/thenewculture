# TNC Dashboard

Ứng dụng quản trị nội dung nội bộ cho The New Culture, kết nối trực tiếp với
Supabase (Auth + Database + Storage). Thay thế Sveltia CMS — không còn ghi
Markdown vào `content/`, mọi thay đổi ghi thẳng vào Supabase, và
`scripts/build.py` đọc lại từ đó khi build site công khai (`public/`).

**Đây là một ứng dụng hoàn toàn độc lập** với site tĩnh chính (`public/`,
sinh bởi `scripts/build.py`) — không build vào `public/`, không được wire
vào `.github/workflows/main.yml`. Deploy riêng (vd một project Cloudflare
Pages khác trỏ vào thư mục `dashboard/`).

## Giai đoạn 1 (hiện tại) — hoàn thành cả 6 module + Dashboard Home

- Đăng nhập bằng Supabase Auth (email/mật khẩu).
- Chỉ tài khoản có hồ sơ `authors` đang active (khớp email) mới vào được —
  xem `public.is_active_editor()` trong `database/migrate_rev5_dashboard_access.sql`.
- **Dashboard Home** (`/`, trang đầu tiên sau đăng nhập) — "Editorial Command
  Center": Hero header (tên editor/ngày/giờ/version), 8 KPI card, Recent
  Articles (10 bài mới nhất), Publishing Overview (biểu đồ thanh CSS theo
  status), Quick Actions, Editorial Health, System Status. Toàn bộ số liệu
  lấy thật từ Supabase qua `src/lib/dashboardData.js` (8 query chạy song
  song bằng `Promise.allSettled` — 1 query lỗi không kéo sập cả trang). Chi
  tiết ở mục "Dashboard Home" bên dưới.
- **Articles**: danh sách + lọc trạng thái/tìm kiếm, tạo/sửa mọi cột, gắn/gỡ
  tag, soft-delete + khôi phục, upload ảnh cover/poster lên Storage.
- **Authors**: tạo/sửa hồ sơ biên tập viên — vai trò (role_id tiếng Việt +
  giá trị chung), vinh danh, huy hiệu (chip chọn từ registry mirror của
  `EDITOR_ROLES`/`EDITOR_HONORS`/`EDITOR_BADGES` trong `scripts/build.py`,
  xem `src/lib/editorRegistries.js`), avatar upload, is_active, soft-delete.
- **Categories**: cây phân cấp qua `parent_id` (chọn danh mục cha, tự loại
  chính nó khỏi danh sách), sort_order, soft-delete.
- **Series**: slug/code/tên/mô tả, ảnh bìa upload, accent_color, sort_order,
  soft-delete.
- **Tags**: sửa nhanh dạng inline (bảng đơn giản, không cần trang riêng).
- **Media**: thư viện media — upload trực tiếp cho `image`/`gif` (khớp
  `allowed_mime_types` của bucket), nhập URL thủ công cho `video`/`audio`/
  `document` (bucket chỉ nhận ảnh); gắn với author/article tuỳ chọn.

## Thiết lập

```bash
cd dashboard
npm install
cp .env.example .env.local   # điền VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                  # dev server
npm run build                # build production ra dist/
```

`VITE_SUPABASE_ANON_KEY` là anon key (an toàn lộ ra client — mọi quyền thật
do RLS policy quyết định). **Tuyệt đối không** đặt `service_role` key ở đây
hay bất kỳ đâu trong `dashboard/`.

## Deploy lên Cloudflare Pages

Project Pages riêng, trỏ vào thư mục `dashboard/` trong cùng repo — hoàn
toàn tách biệt với project Pages đang chạy `public/` (site công khai),
không ảnh hưởng gì đến nhau.

**Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git:**

1. Chọn repo `lamaronthebeatz-ai/thenewculture`.
2. Đặt tên project, vd `tnc-dashboard` (quyết định subdomain
   `tnc-dashboard.pages.dev`).
3. Production branch: chọn branch đang có code Dashboard (hiện tại là
   `claude/new-culture-homepage-hhwbgh`, hoặc `main` sau khi đã merge).
4. Build settings:
   - Framework preset: `Vite` (hoặc `None` rồi điền tay như dưới)
   - Root directory (**bắt buộc**, mục "Build configuration" → "Root
     directory (advanced)"): `dashboard`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. "Environment variables" (khai báo cho cả Production và Preview):
   - `VITE_SUPABASE_URL` = URL project Supabase (dạng
     `https://xxxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = anon key của project Supabase
   - **Không** khai báo `service_role` key ở đây hay bất kỳ đâu.
6. Bấm "Save and Deploy".

Vite đọc 2 biến `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` này ngay lúc
build (`import.meta.env.*`, xem `src/lib/supabaseClient.js`) — không có gì
hardcode trong code, đổi giá trị trong Cloudflare Pages settings rồi
redeploy là áp dụng luôn, không cần sửa code.

Trước đây có `public/_redirects` (`/* /index.html 200`) để React Router hoạt
động đúng trên Cloudflare Pages khi tải thẳng một URL như `/articles/xyz`
(bấm refresh, hoặc mở link trực tiếp trên tablet). Đã **xoá file này** vì
đúng rule đó ("/* /index.html 200") bị Cloudflare Pages báo lỗi build
"Found invalid redirect lines... Infinite loop detected" — đây là false
positive đã biết của validator `_redirects` trên Cloudflare (issue công khai
trên `cloudflare/workers-sdk`, mã lỗi 10021), không phải lỗi cấu hình của dự
án này. Không cần file `_redirects` để sửa: theo tài liệu chính thức của
Cloudflare Pages, nếu project **không có** file `404.html` ở gốc thư mục
build, Cloudflare tự hiểu đây là single-page application và tự route mọi
đường dẫn chưa khớp file tĩnh nào về `index.html` — đúng hành vi ta cần,
không phải cấu hình thêm gì, và không đụng tới cơ chế `_redirects` đang có
bug.

## Yêu cầu phía Supabase

1. Đã chạy `database/schema.sql` (+ `database/migrate_rev4_real_content.sql`
   nếu project deploy trước Rev 4) và `database/seed.sql`.
2. Đã chạy `database/migrate_rev5_dashboard_access.sql` — cấp quyền
   INSERT/UPDATE cho editor đăng nhập qua Supabase Auth, và tạo Storage
   bucket `media`.
3. Mỗi editor cần một tài khoản Supabase Auth (Authentication → Users →
   Add user) dùng **đúng email đã có trong `authors.email`** — đây là cách
   duy nhất `is_active_editor()` nhận diện họ là biên tập viên (không có cột
   liên kết `authors.user_id`, giữ đúng yêu cầu không đổi cấu trúc bảng).

## Dashboard Home

Trang `/` tổng hợp dữ liệu qua `loadDashboardData()` trong
`src/lib/dashboardData.js` — 8 query Supabase chạy song song
(`Promise.allSettled`, không phải `Promise.all`: 1 query lỗi không kéo sập
các card khác), mỗi query chỉ lấy đúng cột cần dùng (không có card nào query
dư). `summarize()` tổng hợp thuần phía client từ kết quả đó — tách riêng để
tái dùng cho các trang thống kê sau này (Analytics/Workflow) mà không phải
viết lại logic đếm.

| Card | Nguồn dữ liệu | Trạng thái |
|---|---|---|
| 8 KPI card | `articles`/`authors`/`categories`/`series`/`tags`/`media` | Dữ liệu thật |
| Recent Articles | `articles` (10 mới nhất theo `updated_at`, kèm `authors`/`series`) | Dữ liệu thật |
| Publishing Overview | `articles.status` (đếm theo 5 trạng thái) | Dữ liệu thật |
| Editorial Health (draft/scheduled/author inactive/media chưa dùng) | `articles`/`authors`/`media` | Dữ liệu thật |
| System Status (Database/Storage) | Kết quả thành công/thất bại của chính các query trên + 1 lệnh gọi `storage.list()` | Dữ liệu thật |
| System Status (Authentication) | Session hiện có trong `AuthContext` (đã đăng nhập = online) | Suy ra, không cần query riêng |
| System Status (Cloudflare Pages) | Trang đang chạy được nghĩa là đang online | Suy ra, không cần query riêng |
| Quick Actions | Điều hướng tĩnh tới route tạo mới của từng module | Không cần dữ liệu |

Mọi số liệu schema hỗ trợ được đều lấy thật — không có mục nào phải hiện
"Coming Soon" ở thời điểm này (cơ chế Coming Soon trong `KpiCard`/
`EditorialHealthCard` vẫn giữ lại cho các số liệu chưa có nguồn dữ liệu
trong tương lai, vd Analytics/Notification).

Mỗi card tự xử lý 4 trạng thái: `loading` (skeleton), `error` (thông báo
nhẹ, không chặn các card khác), rỗng (empty state), và dữ liệu thật —
component dùng chung: `src/components/Skeleton.jsx`,
`src/components/dashboard/DashboardCard.jsx`.

## Kiến trúc

- React + Vite, không dùng framework CSS ngoài — CSS thuần trong
  `src/styles/index.css`.
- `@supabase/supabase-js` gọi thẳng PostgREST/Storage/Auth của Supabase,
  không qua backend trung gian nào — quyền ghi hoàn toàn dựa vào RLS policy
  (Rev 5), không bao giờ dùng `service_role`.
- `src/auth/AuthContext.jsx` — quản lý session + gọi RPC `is_active_editor`
  sau khi đăng nhập để quyết định cho vào Dashboard hay không.
- `src/pages/*List.jsx` / `*Form.jsx` — mỗi module 1 cặp danh sách + form
  (Tags dùng form inline ngay trong list vì chỉ có 2 cột).
- `src/components/ImageUploader.jsx` — upload ảnh lên bucket `media`, validate
  mime-type/dung lượng khớp giới hạn đã cấu hình ở Rev 5.
- `src/lib/editorRegistries.js` — mirror thủ công của `EDITOR_ROLES`/
  `EDITOR_HONORS`/`EDITOR_BADGES` trong `scripts/build.py` để hiện nhãn tiếng
  Việt trong form Authors. Đây là bản sao CHỈ ĐỂ HIỂN THỊ — nếu build.py đổi/
  thêm role/badge/honor, cập nhật lại đúng file này.

## Đã biết, chưa xử lý

- `react-router-dom` hiện ở nhánh 6.x — `npm audit` báo 1 lỗ hổng mức
  moderate (open-redirect) đã có bản vá ở nhánh 7.x (breaking change). Chưa
  nâng cấp trong giai đoạn 1 vì đây là công cụ nội bộ sau xác thực, không
  phải bề mặt public; cân nhắc nâng cấp lên react-router-dom 7 ở đợt sau.
- Trường `ranking` (jsonb) của Articles chỉnh qua ô JSON thô ("Nâng cao") —
  chưa có UI dạng danh sách kéo-thả, vì chỉ 1 bài viết thật hiện dùng trường
  này.
