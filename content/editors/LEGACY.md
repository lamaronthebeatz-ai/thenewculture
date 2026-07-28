# LEGACY — KHÔNG CÒN ĐƯỢC WEBSITE ĐỌC

**Trạng thái: Legacy / Unused / Backup only.**

Từ đợt migration Markdown → Supabase, `scripts/build.py` không còn đọc thư
mục này nữa — hồ sơ biên tập viên đã chuyển sang bảng `public.authors` trên
Supabase (xem `load_editors()` trong `scripts/build.py`, lọc theo
`role_id` hợp lệ để quyết định ai có trang tác giả riêng).

Các file `.md` trong thư mục này được **giữ lại làm bản lưu trữ lịch sử**,
không bị xoá, nhưng sửa/xoá/thêm file ở đây **không có tác dụng gì** lên
website — mọi thay đổi hồ sơ biên tập viên thật sự phải thực hiện qua **TNC
Dashboard** (`dashboard/`, module Authors), ghi thẳng vào Supabase.
