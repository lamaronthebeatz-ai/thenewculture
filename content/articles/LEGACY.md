# LEGACY — KHÔNG CÒN ĐƯỢC WEBSITE ĐỌC

**Trạng thái: Legacy / Unused / Backup only.**

Từ đợt migration Markdown → Supabase, `scripts/build.py` không còn đọc thư
mục này nữa — toàn bộ bài viết đã chuyển sang bảng `public.articles` trên
Supabase (xem `load_articles()` trong `scripts/build.py`, và
`database/import_real_content.sql` cho lần import nội dung thật ban đầu).

Các file `.md` trong thư mục này được **giữ lại làm bản lưu trữ lịch sử**,
không bị xoá, nhưng sửa/xoá/thêm file ở đây **không có tác dụng gì** lên
website — mọi thay đổi nội dung bài viết thật sự phải thực hiện qua **TNC
Dashboard** (`dashboard/`), ghi thẳng vào Supabase.

Xem `database/DATABASE_DOCUMENTATION.md` và
`database/ARCHITECTURE_REVIEW.md` để biết chi tiết kiến trúc hiện tại.
