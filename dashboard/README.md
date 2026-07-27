# TNC Dashboard

Ứng dụng quản trị nội dung nội bộ cho The New Culture, kết nối trực tiếp với
Supabase (Auth + Database + Storage). Thay thế Sveltia CMS — không còn ghi
Markdown vào `content/`, mọi thay đổi ghi thẳng vào Supabase, và
`scripts/build.py` đọc lại từ đó khi build site công khai (`public/`).

**Đây là một ứng dụng hoàn toàn độc lập** với site tĩnh chính (`public/`,
sinh bởi `scripts/build.py`) — không build vào `public/`, không được wire
vào `.github/workflows/main.yml`. Deploy riêng (vd một project Cloudflare
Pages khác trỏ vào thư mục `dashboard/`).

## Giai đoạn 1 (hiện tại)

- Đăng nhập bằng Supabase Auth (email/mật khẩu).
- Chỉ tài khoản có hồ sơ `authors` đang active (khớp email) mới vào được —
  xem `public.is_active_editor()` trong `database/migrate_rev5_dashboard_access.sql`.
- Module **Articles**: CRUD đầy đủ (danh sách + lọc trạng thái/tìm kiếm, tạo/
  sửa mọi cột, gắn/gỡ tag, soft-delete + khôi phục, upload ảnh cover/poster
  lên Supabase Storage bucket `media`).
- Authors/Categories/Series/Tags/Media: mới có khung điều hướng, hiện
  "sắp ra mắt" — sẽ triển khai ở các đợt tiếp theo.

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

## Kiến trúc

- React + Vite, không dùng framework CSS ngoài — CSS thuần trong
  `src/styles/index.css`.
- `@supabase/supabase-js` gọi thẳng PostgREST/Storage/Auth của Supabase,
  không qua backend trung gian nào — quyền ghi hoàn toàn dựa vào RLS policy
  (Rev 5), không bao giờ dùng `service_role`.
- `src/auth/AuthContext.jsx` — quản lý session + gọi RPC `is_active_editor`
  sau khi đăng nhập để quyết định cho vào Dashboard hay không.
- `src/pages/ArticlesList.jsx` / `ArticleForm.jsx` — module Articles đầy đủ.
- `src/components/ImageUploader.jsx` — upload ảnh lên bucket `media`, validate
  mime-type/dung lượng khớp giới hạn đã cấu hình ở Rev 5.

## Đã biết, chưa xử lý

- `react-router-dom` hiện ở nhánh 6.x — `npm audit` báo 1 lỗ hổng mức
  moderate (open-redirect) đã có bản vá ở nhánh 7.x (breaking change). Chưa
  nâng cấp trong giai đoạn 1 vì đây là công cụ nội bộ sau xác thực, không
  phải bề mặt public; cân nhắc nâng cấp lên react-router-dom 7 ở đợt sau.
- Trường `ranking` (jsonb) của Articles chỉnh qua ô JSON thô ("Nâng cao") —
  chưa có UI dạng danh sách kéo-thả, vì chỉ 1 bài viết thật hiện dùng trường
  này.
