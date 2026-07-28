# on-article-published — Edge Function

Bước lọc + relay của pipeline auto-publish (Phase 2A). Nhận Database Webhook
từ Supabase khi bảng `articles` có INSERT/UPDATE, chỉ kích hoạt GitHub
Actions build lại site khi `status` **vừa chuyển sang** `published` (không
phải mọi thay đổi). Xem giải thích đầy đủ trong comment đầu file
`index.ts`.

Không đụng gì tới `database/schema.sql`, RLS, hay Dashboard — đây là hạ tầng
Supabase (Edge Function + Database Webhook), cấu hình hoàn toàn qua Supabase
Dashboard, độc lập với schema.

## Cần làm (thủ công, ngoài khả năng của tôi — không có quyền truy cập tài
khoản Supabase/GitHub của bạn)

### 1. Tạo GitHub Personal Access Token

GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token:
- Repository access: chỉ chọn đúng repo `thenewculture`.
- Permissions: **Contents** = Read and write, **Actions** = Read and write.
- Lưu token lại (chỉ hiện 1 lần).

### 2. Deploy Edge Function

```bash
npm install -g supabase   # nếu chưa có Supabase CLI
supabase login
supabase link --project-ref <project-ref-của-bạn>
supabase functions deploy on-article-published
```

### 3. Khai báo Secrets cho Edge Function

```bash
supabase secrets set GITHUB_TOKEN=<token bước 1>
supabase secrets set GITHUB_OWNER=lamaronthebeatz-ai
supabase secrets set GITHUB_REPO=thenewculture
supabase secrets set WEBHOOK_SECRET=<tự đặt 1 chuỗi ngẫu nhiên bất kỳ>
```

### 4. Tạo Database Webhook trên Supabase Dashboard

Database → Webhooks → Create a new hook:
- Name: `article-published` (tuỳ chọn)
- Table: `articles`
- Events: tick **Insert** và **Update**
- Type: **Supabase Edge Functions**
- Edge Function: chọn `on-article-published`
- HTTP Headers: thêm `x-webhook-secret` = đúng giá trị `WEBHOOK_SECRET` đã
  đặt ở bước 3 (bắt buộc — thiếu header này mọi request sẽ bị từ chối 401,
  đây là cơ chế chống ai đó gọi bừa endpoint để spam trigger build).
- Save.

### 5. Xác nhận

Đăng bài test trong Dashboard (chuyển status sang Published). Trong vòng
~1–2 phút, kiểm tra:
- Supabase Dashboard → Edge Functions → on-article-published → Logs — phải
  thấy 1 request `triggered: true`.
- GitHub → repo → Actions — phải thấy 1 run mới của workflow "Build TNC
  site", trigger là `repository_dispatch`.
- Website public phải có bài viết mới sau khi run đó hoàn tất (~1–2 phút
  build + Cloudflare Pages redeploy).

Nếu Logs báo `triggered: false`, kiểm tra lại đúng lý do trong response
(`reason`) — thường là do trạng thái cũ đã là `published` từ trước (sửa bài
đã đăng không kích hoạt lại, đúng thiết kế).
