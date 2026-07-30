# admin-create-user — Edge Function

Đề xuất Dashboard V2.2 #2 (đã triển khai trong v2.1.1): cho phép form
"+ User mới" (`dashboard/src/pages/UserForm.jsx`) tự tạo tài khoản Supabase
Auth, thay vì bắt admin phải vào Supabase Studio → Authentication → Users
tạo thủ công trước.

Xác thực bằng cách gọi lại đúng `has_permission('users.create')` (Rev 13/14)
bằng JWT của người gọi — **không dùng `service_role` phía client**, đúng
nguyên tắc bảo mật xuyên suốt dự án. `service_role` chỉ tồn tại bên trong
function này (biến môi trường server-side, Supabase tự cấp cho mọi Edge
Function, không cần `secrets set` thêm) để gọi Admin API
(`/auth/v1/admin/users`) — thao tác duy nhất bắt buộc phải có service_role.

Sau khi function trả về `{ ok: true, id, email }`, Dashboard (vẫn dùng
session của chính admin đang gọi, KHÔNG phải service_role) tự `insert` vào
`dashboard_users` — request đó đi qua RLS bình thường như mọi thao tác khác.

## Cần làm (thủ công — không có quyền truy cập tài khoản Supabase của bạn)

```bash
supabase functions deploy admin-create-user
```

`supabase/config.toml` đã đặt `verify_jwt = false` cho function này (bắt
buộc — xem giải thích ở `trigger-rebuild/README.md`, cùng lý do). Nếu bản CLI
không đọc `config.toml`, chạy thủ công:

```bash
supabase functions deploy admin-create-user --no-verify-jwt
```

**Không cần cấu hình secret nào thêm** — `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` do Supabase tự cấp cho mọi Edge Function.

## Xác nhận

Đăng nhập Dashboard bằng tài khoản có quyền `users.create`, vào Users → "+
User mới" → nhập 1 email CHƯA từng có tài khoản Auth → bấm "Tạo tài khoản
Auth mới". Kiểm tra Supabase Studio → Authentication → Users phải thấy tài
khoản mới (đã auto-confirm). Nếu chưa deploy function này, nút đó báo lỗi —
UserForm vẫn cho phép nhập email của 1 tài khoản Auth đã có sẵn (tạo thủ công
tại Supabase Studio) như trước, không có gì bị chặn hoàn toàn.
