# The New Culture — Hệ thống quản trị nội dung

Tài liệu này hướng dẫn cách thiết lập và sử dụng hệ thống viết bài cho web TNC.
Đọc kỹ **Phần 1** (thiết lập một lần) trước, sau đó **Phần 2** là việc bạn làm hằng ngày.

---

## Toàn cảnh hệ thống hoạt động thế nào

```
Bạn viết bài trong CMS (trên tablet)
        │  bấm "Publish"
        ▼
Sveltia CMS lưu file .md vào GitHub (thư mục content/articles/)
        │
        ▼
GitHub Actions tự động chạy scripts/build.py
        │  sinh lại trang chủ + series + menu (liên kết tự động)
        ▼
Kết quả lưu vào thư mục public/
        │
        ▼
Cloudflare Pages phát hiện thay đổi → web cập nhật sau vài giây
```

Bạn chỉ thao tác ở bước đầu tiên. Mọi thứ còn lại tự động.

---

## PHẦN 1 — THIẾT LẬP (chỉ làm một lần)

### Bước 1: Đưa các file này vào repo GitHub

Cấu trúc thư mục cần có trong repo:

```
repo của bạn/
├── admin/
│   ├── index.html          ← trang quản trị
│   └── config.yml          ← cấu hình form nhập bài
├── content/
│   └── articles/           ← các bài viết (.md) nằm ở đây
│       └── (8 bài mẫu)
├── scripts/
│   ├── build.py            ← script sinh site
│   └── style.css           ← giao diện
├── public/                 ← site đã sinh (Cloudflare phục vụ thư mục này)
└── .github/
    └── workflows/
        └── build.yml       ← robot tự động build
```

Tải toàn bộ các file đi kèm và upload lên repo qua github.com (nút **Add file → Upload files**), giữ đúng cấu trúc thư mục trên.

### Bước 2: Sửa tên repo trong config

Mở file `admin/config.yml`, tìm dòng:

```yaml
repo: TEN-GITHUB/TEN-REPO
```

Đổi thành repo thật của bạn. Ví dụ tài khoản `lamar`, repo tên `tnc-web`:

```yaml
repo: lamar/tnc-web
```

Kiểm tra luôn dòng `branch: main` — nếu nhánh chính của bạn tên `master` thì đổi lại thành `master`.

### Bước 3: Cấu hình Cloudflare Pages phục vụ thư mục `public`

Vào Cloudflare Pages → dự án của bạn → **Settings → Builds & deployments**:
- **Build output directory**: đặt là `public`
- Không cần build command (để trống), vì GitHub Actions đã build sẵn.

Nếu trước đây bạn để Cloudflare phục vụ từ thư mục gốc, đổi sang `public` là bước quan trọng để web hiển thị đúng bản mới.

### Bước 4: Bật quyền cho GitHub Actions

Vào repo trên github.com → **Settings → Actions → General** → kéo xuống mục **Workflow permissions** → chọn **Read and write permissions** → Save.

Bước này cho phép robot tự lưu kết quả build trở lại repo.

### Bước 5: Tạo mật khẩu truy cập (Personal Access Token)

Đây là cách đăng nhập CMS đơn giản nhất, không cần dựng server.

1. Trên tablet, mở: `https://github.com/settings/tokens`
2. Bấm **Generate new token** → chọn **Fine-grained token**
3. Đặt tên bất kỳ (ví dụ "TNC CMS"), chọn thời hạn (khuyên chọn dài, ví dụ 1 năm)
4. Mục **Repository access** → chọn **Only select repositories** → chọn repo của bạn
5. Mục **Permissions → Repository permissions** → tìm **Contents** → chọn **Read and write**
6. Bấm **Generate token** và **copy chuỗi token** (chỉ hiện 1 lần, lưu lại nơi an toàn)

### Bước 6: Đăng nhập CMS lần đầu

1. Mở trình duyệt trên tablet, vào: `https://TÊN-MIỀN-CỦA-BẠN/admin/`
   (ví dụ `https://thenewculture.pages.dev/admin/`)
2. Màn hình đăng nhập hiện ra → bấm **Sign in with Token**
3. Dán chuỗi token vừa tạo ở Bước 5
4. Xong. Bạn đã vào được giao diện quản trị.

---

## PHẦN 2 — VIẾT VÀ ĐĂNG BÀI (việc hằng ngày)

1. Mở `https://TÊN-MIỀN-CỦA-BẠN/admin/` trên tablet
2. Bấm **Bài viết → New Bài viết**
3. Điền form:
   - **Tiêu đề**: tên bài
   - **Series**: chọn 1 trong 16 chuyên mục (bài sẽ tự vào đúng trang series)
   - **Tóm tắt**: đoạn mô tả ngắn
   - **Tác giả, Ngày đăng, Thời gian đọc**: điền tương ứng
   - **Bài nổi bật**: bật nếu muốn bài làm hero lớn trên trang chủ (chỉ nên bật 1 bài)
   - **Thứ tự ưu tiên**: số nhỏ = hiện trước. Bài mới nhất để số nhỏ (1, 2, 3...)
   - **Thẻ**: các từ khóa
   - **Nội dung**: viết bài. Gõ `##` đầu dòng để tạo tiêu đề phụ, `>` để tạo trích dẫn
4. Bấm **Publish → Publish now**
5. Chờ khoảng 1–2 phút: robot build xong, Cloudflare cập nhật, bài xuất hiện trên web — tự động lên trang chủ, trang series và menu.

### Sửa hoặc xóa bài
Vào **Bài viết**, chọn bài cần sửa → chỉnh → **Publish**. Hoặc bấm xóa. Web tự cập nhật theo.

---

## Kiểm tra khi có sự cố

**Bài không lên sau vài phút?**
Vào repo → tab **Actions** trên github.com. Xem lần chạy mới nhất:
- Dấu ✔ xanh: build thành công, chờ Cloudflare thêm chút.
- Dấu ✘ đỏ: build lỗi. Bấm vào xem dòng báo lỗi (thường do thiếu trường bắt buộc như Tiêu đề hoặc Series). Web cũ vẫn nguyên, không hỏng.

**Đăng nhập CMS báo lỗi token?**
Token có thể đã hết hạn. Tạo token mới theo Bước 5 và đăng nhập lại.

**Ảnh không hiện?**
Ảnh tải qua CMS lưu ở `public/uploads`. Đảm bảo Cloudflare phục vụ từ thư mục `public`.

---

## Ghi chú kỹ thuật (không bắt buộc đọc)

- **Chi phí: 0 đồng.** Repo public thì GitHub Actions miễn phí không giới hạn; repo private được 2.000 phút/tháng (mỗi build ~1 phút).
- Bài viết lưu dạng Markdown trong `content/articles/`, tách rời khỏi giao diện — đúng nguyên tắc "nội dung là tài sản độc lập" (Archive Asset).
- Muốn đổi giao diện: sửa `scripts/style.css`. Muốn đổi cấu trúc trang: sửa `scripts/build.py`. Mỗi lần sửa và đẩy lên, robot tự build lại toàn site.
- Sveltia CMS đang ở giai đoạn beta nhưng đã được nhiều tổ chức dùng trong thực tế.
