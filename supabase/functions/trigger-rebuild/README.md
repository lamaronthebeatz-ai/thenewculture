# trigger-rebuild — Edge Function

Bug fix cho lỗi: các module CMS V2 (Site Settings, Menu, Footer, Hero,
Advertisement, Promotion, Announcement — Phase 1-4) không có Database Webhook
riêng như bảng `articles`, nên tạo/sửa dữ liệu ở các module này **không tự
kích hoạt build lại site**. Editor tạo Announcement xong, chờ mãi không thấy
lên site, kiểm tra Cloudflare cũng không có deploy mới — vì đúng là chưa từng
có gì kích hoạt build cả.

Fix gồm 2 phần:

1. **Lịch cron rút ngắn xuống mỗi 15 phút** (`.github/workflows/main.yml`) —
   lưới an toàn tự động cho MỌI bảng CMS V2, hiện tại và sau này, không cần
   thêm Database Webhook riêng cho từng bảng mới.
2. **Function này** — nút "Rebuild site now" trong Dashboard (mọi trang đều
   có, xem `dashboard/src/layout/Sidebar.jsx`), cho editor chủ động kích hoạt
   build ngay sau khi sửa xong, không cần chờ tới 15 phút.

Xác thực bằng cách gọi lại đúng `is_active_editor()` (đã có từ Rev 5) bằng
JWT của người gọi — không dùng `service_role`, không tạo luồng phân quyền
mới, đúng nguyên tắc bảo mật đã áp dụng xuyên suốt dự án.

## Cần làm (thủ công — không có quyền truy cập tài khoản Supabase của bạn)

### 1. Deploy Edge Function

```bash
supabase functions deploy trigger-rebuild
```

**Không cần cấu hình secret nào thêm** — `SUPABASE_URL`/`SUPABASE_ANON_KEY` do
Supabase tự cấp cho mọi Edge Function; `GITHUB_TOKEN`/`GITHUB_OWNER`/
`GITHUB_REPO` đã cấu hình từ Phase 2A cho `on-article-published`, dùng chung
cho toàn bộ project.

### 2. Xác nhận

Đăng nhập Dashboard, bấm "Rebuild site now" ở cuối sidebar. Trong vòng
~1–2 phút, kiểm tra:

- GitHub → repo → Actions — phải thấy 1 run mới, trigger là
  `repository_dispatch` / `cms-config-changed`.
- Website public phải phản ánh đúng thay đổi mới nhất (Announcement, Hero,
  Ads, Promotion, Menu, Footer, Site Settings...) sau khi run đó hoàn tất.

Nếu bấm nút mà không thấy phản hồi/báo lỗi 401/403 — kiểm tra lại đã đăng
nhập đúng tài khoản editor (khớp `authors.email`, chưa bị xoá mềm) hay chưa.
