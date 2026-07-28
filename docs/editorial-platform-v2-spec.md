# The New Culture — Editorial Platform Specification v1.0

**Phase 1 của Version 2.0.** Tài liệu đặc tả kiến trúc, không phải kế hoạch triển khai. Không có dòng code nào được viết cùng tài liệu này; không có backend, package, hay thay đổi nào lên website hiện tại (`public/`, `scripts/build.py`, `admin/`) đi kèm.

Roadmap V1.0 (Design System → Homepage → Article Page → Category/Series → Discovery System) coi như đã hoàn thiện production. Tài liệu này mở Version 2.0: từ "một người viết, tự build, tự publish" sang "nhiều biên tập viên, quy trình duyệt bài, hàng nghìn bài viết" — **mà không đổi nền tảng.**

---

## 1. Vision

### 1.1 Vấn đề cần giải quyết

Hệ thống hiện tại (V1.0) được thiết kế cho đúng một người: Lamar vừa viết, vừa duyệt, vừa publish, thông qua Sveltia CMS ở chế độ "simple" (mỗi lần bấm Publish là commit thẳng vào `main`). Điều đó đúng cho quy mô 1 tác giả, ~10 bài viết. Nó **không** còn đúng khi:

- Có nhiều biên tập viên/cộng tác viên viết bài cùng lúc.
- Cần một bước duyệt bài trước khi lên web (kiểm tra chính tả, tuân thủ biên tập, tránh bài lỗi lọt production).
- Kho bài viết tăng lên hàng trăm, hàng nghìn — cần khả năng phân quyền, truy vết ai viết/duyệt/publish, và một "phòng tổng biên tập" để nhìn toàn cảnh thay vì lục từng file.

### 1.2 Triết lý thiết kế

> **Mọi thứ trong Version 2.0 phải là cấu hình lại của GitHub + Cloudflare + Sveltia CMS + `scripts/build.py` đang có — không phải một hệ thống mới đặt cạnh nó.**

Cụ thể:
- **Không có server ứng dụng nào cả.** Không Node backend, không database, không API tự viết. "Dữ liệu" luôn luôn là file trong Git. "Trạng thái" luôn luôn là trạng thái của Git (branch, PR, review, merge).
- **Không tạo hệ thống tài khoản/mật khẩu riêng.** Danh tính = tài khoản GitHub. Quyền hạn = quyền hạn trên GitHub repo. Không có bảng `users` nào tồn tại ngoài GitHub.
- **CMS vẫn là Sveltia CMS.** Không đổi sang Netlify CMS, Decap CMS, Strapi, hay bất kỳ hệ thống có backend nào khác. Sveltia CMS đã hỗ trợ sẵn chế độ multi-editor (`editorial_workflow`) — Version 2.0 chỉ là **bật** tính năng đã có, không phải xây tính năng mới.
- **Build pipeline vẫn là `scripts/build.py` + GitHub Actions.** Không thêm bundler, không thêm framework, không đổi sang SSR. Static site sinh ra, Cloudflare Pages phục vụ, y hệt hôm nay.
- **Mở rộng = thêm cấu hình (branch protection, CODEOWNERS, GitHub Teams), không phải thêm hạ tầng.**

### 1.3 Điều Version 2.0 KHÔNG làm

Để tránh over-engineer, minh định rõ ràng những gì Version 2.0 **cố tình không giải quyết** ở Phase 1 này (xem thêm mục 12 — Future Expansion nếu thật sự cần sau này):

- Không xây dashboard phân tích số liệu riêng (Cloudflare Web Analytics đã đủ cho quy mô hiện tại).
- Không xây hệ thống comment, real-time collab editing, hay notification app riêng.
- Không xây API công khai.
- Không đổi search từ client-side JSON sang search engine có backend.

---

## 2. Kiến trúc tổng thể

### 2.1 Sơ đồ luồng (không đổi so với V1.0 — chỉ thêm một nhánh rẽ ở bước "Publish")

```
┌─────────────┐      ┌──────────────────┐      ┌───────────────────────┐
│  Biên tập   │──────▶  Sveltia CMS UI   │──────▶  GitHub (repo chính) │
│  viên (n)   │ auth │ (chạy trong      │ Git   │  lamaronthebeatz-ai/  │
│  qua GitHub │ PAT/ │  trình duyệt,    │ Data  │  thenewculture        │
│  account    │ OAuth│  không server)   │ API   │                       │
└─────────────┘      └──────────────────┘      └───────────┬───────────┘
                                                              │
                              ┌───────────────────────────────┤
                              │  V1.0: commit thẳng vào main   │
                              │  V2.0: PR vào nhánh nội dung    │
                              │        → review → merge         │
                              ▼                                ▼
                    ┌──────────────────┐            ┌─────────────────────┐
                    │ GitHub Actions   │            │ Cloudflare Pages     │
                    │ (main.yml)       │            │ Preview Deployment   │
                    │ python build.py  │            │ (mỗi PR có URL riêng │
                    │ → commit public/ │            │  để xem trước khi    │
                    └────────┬─────────┘            │  duyệt — tính năng   │
                              │                       │  có sẵn của Cloud-  │
                              ▼                       │  flare Pages)        │
                    ┌──────────────────┐            └─────────────────────┘
                    │ Cloudflare Pages  │
                    │ (production,      │
                    │  serve public/)   │
                    └──────────────────┘
```

### 2.2 Bốn khối không đổi

| Khối | Vai trò | V1.0 | V2.0 |
|---|---|---|---|
| **GitHub** | Nguồn sự thật duy nhất (content, code, lịch sử, review) | Repo đơn, push thẳng `main` | Repo đơn, branch protection + PR review trên `main` |
| **Sveltia CMS** | Giao diện biên tập, chạy hoàn toàn phía trình duyệt | `publish_mode` mặc định (simple) | `publish_mode: editorial_workflow` |
| **`scripts/build.py` + GitHub Actions** | Biến Markdown/YAML thành HTML tĩnh | Trigger `on: push to main` | Không đổi — vẫn chỉ trigger khi có commit vào `main`, tức là **sau khi PR được duyệt và merge** |
| **Cloudflare Pages** | CDN + hosting tĩnh | 1 deployment production | Production + Preview Deployment tự động cho mỗi PR (tính năng có sẵn, chỉ cần bật) |

### 2.3 Nguyên tắc "một nguồn sự thật"

Không có khái niệm "trạng thái bài viết" nằm ngoài Git. Một bài viết đang ở đâu trong quy trình biên tập được suy ra **hoàn toàn** từ trạng thái Git của nó:

| Trạng thái biên tập | Biểu diễn trong Git |
|---|---|
| Đang viết nháp | Nhánh `sveltia/cms/content-{tên}` tồn tại, chưa có PR |
| Đã gửi duyệt | PR mở, chưa có review approve |
| Đang duyệt | PR mở, có comment/change-request |
| Đã duyệt, chờ publish | PR có ít nhất 1 approval, đạt điều kiện branch protection |
| Đã publish | PR đã merge vào `main` → Action đã build → Cloudflare đã deploy |

Không cần một trường `status:` riêng trong frontmatter để track việc này (xem thêm mục 7).

---

## 3. User Roles

Vai trò được định nghĩa theo **năng lực biên tập thực tế**, sau đó map 1-1 sang một cơ chế GitHub có sẵn — không có vai trò nào cần một hệ thống quyền hạn tùy chỉnh.

| Vai trò | Mô tả | Ai giữ hôm nay |
|---|---|---|
| **Editor-in-Chief** | Toàn quyền: publish trực tiếp, sửa cấu hình site/CMS, quản lý vai trò người khác | Lamar |
| **Senior Editor** | Duyệt & merge bài của người khác; tự viết & tự publish bài của mình | (mới, V2.0) |
| **Staff Writer** | Viết bài, gửi duyệt; **không** tự merge được vào `main` | (mới, V2.0) |
| **Guest Contributor** | Viết bài dưới dạng PR từ fork hoặc nhánh giới hạn; luôn cần duyệt | (mới, V2.0, tùy chọn) |

Bốn vai trò trên map sang đúng 4 mức quyền GitHub repository role có sẵn (không cần custom RBAC):

| Vai trò biên tập | GitHub repository role |
|---|---|
| Editor-in-Chief | **Admin** |
| Senior Editor | **Maintain** (merge PR, quản lý branch protection cơ bản, không xóa repo/đổi Actions) |
| Staff Writer | **Write** (push nhánh, mở PR, **không** merge vào nhánh được bảo vệ) |
| Guest Contributor | **Triage** hoặc cộng tác qua **fork** (mở PR từ fork, không có quyền push vào repo gốc) |

---

## 4. Permission Matrix

Cột là hành động cụ thể, hàng là vai trò. "✓" = được phép qua chính cơ chế GitHub tương ứng (không có tầng kiểm tra quyền nào khác).

| Hành động | Editor-in-Chief | Senior Editor | Staff Writer | Guest Contributor |
|---|:---:|:---:|:---:|:---:|
| Tạo bài nháp mới (qua CMS) | ✓ | ✓ | ✓ | ✓ (qua fork) |
| Sửa bài nháp của chính mình | ✓ | ✓ | ✓ | ✓ |
| Sửa bài nháp của người khác | ✓ | ✓ | ✗ | ✗ |
| Gửi bài để duyệt (mở PR) | ✓ | ✓ | ✓ | ✓ |
| Duyệt / yêu cầu sửa (review PR) | ✓ | ✓ | ✗ | ✗ |
| Merge PR vào `main` (= publish) | ✓ | ✓ | ✗ | ✗ |
| Sửa bài đã publish (hotfix) | ✓ | ✓ | Qua PR mới, cần duyệt | Qua PR mới, cần duyệt |
| Xóa bài viết | ✓ | ✓ (cần lý do rõ trong PR) | ✗ | ✗ |
| Sửa `content/settings/site.yml` (logo, quảng cáo, social) | ✓ | ✗ | ✗ | ✗ |
| Sửa `admin/config.yml` (thêm field, đổi collection) | ✓ | ✗ | ✗ | ✗ |
| Sửa `scripts/build.py` / Design System | ✓ | ✗ | ✗ | ✗ |
| Quản lý vai trò (mời/xóa cộng tác viên) | ✓ | ✗ | ✗ | ✗ |
| Xem toàn bộ hàng đợi PR đang chờ duyệt | ✓ | ✓ | Chỉ PR của mình | Chỉ PR của mình |

**Cơ chế thực thi (không cần code):**
- Hàng "Duyệt/merge" → **Branch protection rule trên `main`**: yêu cầu tối thiểu 1 approving review + status check (build Action phải pass) trước khi merge được.
- Hàng "Sửa `site.yml`/`config.yml`/`build.py`" → **CODEOWNERS file**, gán các đường dẫn đó cho riêng Editor-in-Chief; PR chạm vào các file này bắt buộc review của người trong CODEOWNERS bất kể ai mở PR.
- Hàng "Staff Writer không merge được" → tự động đúng vì GitHub **Write** role không có quyền merge vào nhánh có bảo vệ nếu người đó không nằm trong danh sách reviewer bắt buộc.

---

## 5. Editorial Workflow

### 5.1 Vòng đời một bài viết

```
[Nháp] → [Gửi duyệt] → [Đang duyệt] → (Yêu cầu sửa) → [Gửi duyệt lại]
                              │
                              ▼
                      [Đã duyệt] → [Publish] → [Đã lên web]
                                                     │
                                                     ▼
                                          [Cần sửa sau publish] → PR mới, lặp lại
```

### 5.2 Vận hành cụ thể qua Sveltia CMS

Sveltia CMS (kế thừa từ Decap/Netlify CMS) có sẵn **Editorial Workflow** — bật bằng đúng 1 dòng cấu hình:

```yaml
publish_mode: editorial_workflow
```

Khi bật, mỗi entry (bài viết) khi được lưu lần đầu sẽ:
1. Tạo một nhánh riêng (`cms/{collection}/{slug}`).
2. Tạo một PR từ nhánh đó vào `main`.
3. Sveltia CMS hiển thị 3 cột trạng thái ngay trong giao diện: **Drafts** (nháp) → **In Review** (đang duyệt) → **Ready** (sẵn sàng publish) — kéo-thả entry giữa các cột để đổi trạng thái, phía dưới là thao tác GitHub API thật (đổi label/trạng thái PR), không phải giao diện giả.
4. Staff Writer kéo bài từ "Drafts" sang "In Review" khi viết xong.
5. Senior Editor / Editor-in-Chief mở PR tương ứng (trực tiếp trên GitHub, hoặc qua nút liên kết trong Sveltia CMS), để lại review comment nếu cần sửa, hoặc approve.
6. Khi đã approve, kéo sang "Ready" rồi bấm **Publish** trong Sveltia CMS (hoặc merge PR thẳng trên GitHub) — hành động này **chính là** GitHub API merge PR.

### 5.3 Vai trò của Cloudflare Pages Preview trong bước duyệt

Mỗi PR (mỗi nhánh `cms/...`) tự động có một Preview Deployment riêng trên Cloudflare Pages — người duyệt xem được **bài đã build ra HTML thật, đúng Design System**, không chỉ đọc Markdown thô. Đây là điểm khác biệt lớn nhất so với đọc diff trên GitHub: reviewer thấy đúng những gì độc giả sẽ thấy, trước khi bấm approve.

### 5.4 Editorial calendar / hàng đợi biên tập

Không xây tính năng lịch biên tập riêng. Tái dùng **GitHub Projects** (board kiểu Kanban có sẵn, miễn phí, gắn thẳng vào repo): cột "Ý tưởng", "Đang viết", "Đang duyệt" (tự động sync từ trạng thái PR), "Đã lên lịch", "Đã publish". Không cần app riêng, không cần đồng bộ dữ liệu thủ công.

---

## 6. Publishing Workflow

### 6.1 Publish tức thời (mặc định)

```
PR đủ điều kiện (review pass + build check pass)
        │
        ▼
Merge vào main  ──────────▶  GitHub Actions (main.yml, không đổi)
                                   │
                                   │ python scripts/build.py
                                   ▼
                             Commit "Auto build: cap nhat public/..."
                             (paths-ignore public/** chan vong lap, khong
                             con dung tag "[skip ci]" — tag nay bi Cloudflare
                             Pages hieu la "bo qua deploy commit nay")
                             (public/ được sinh lại, đẩy vào main)
                                   │
                                   ▼
                       Cloudflare Pages phát hiện thay đổi
                                   │
                                   ▼
                          Web cập nhật (vài giây — vài chục giây)
```

Quy trình này **giữ nguyên 100%** so với V1.0 — không đổi file `.github/workflows/main.yml`. Khác biệt duy nhất: commit vào `main` giờ đến từ một PR-merge (có review) thay vì Sveltia CMS commit thẳng.

### 6.2 Publish có lịch (scheduled) — **không xây ở Phase 1.0**

Ghi nhận nhu cầu, không triển khai ngay (xem mục 12). Lý do: cần một cơ chế "đánh thức" định kỳ (GitHub Actions `schedule` cron) để tự merge PR đúng giờ đã định — về bản chất vẫn không cần backend, chỉ cần thêm 1 workflow file, nhưng **chưa cần thiết** ở quy mô hiện tại (dưới vài chục bài/tuần). Thêm vào khi tần suất xuất bản đủ cao để cần xuất bản đúng khung giờ cố định.

### 6.3 Rollback

Không cần cơ chế rollback riêng — bản chất Git. `git revert` commit "Auto build" tương ứng (hoặc PR merge tương ứng) và push lại `main` sẽ tự động kích hoạt Action build lại, đưa production về trạng thái trước đó. Không có "phiên bản" nào tồn tại ngoài lịch sử Git.

---

## 7. Data Model

### 7.1 Nguyên tắc

Data Model của Editorial Platform **không phải** một schema database mới — nó là tập hợp file Markdown/YAML trong `content/`, mở rộng tối thiểu từ schema V1.0 hiện có, cộng thêm cách GitHub tự nhiên biểu diễn "ai làm gì, khi nào" (tác giả commit, người review PR, thời điểm merge) mà **không cần lưu trùng lặp** các dữ kiện đó vào frontmatter.

### 7.2 Collections hiện có (không đổi cấu trúc, chỉ ghi nhận)

| Collection | Đường dẫn | Vai trò |
|---|---|---|
| `articles` | `content/articles/*.md` | Nội dung bài viết |
| `profiles` | `content/profiles/*.md` | Hồ sơ "thẻ tướng" TNC Profiles |
| `editors` | `content/editors/*.md` | **Hồ sơ hiển thị** tác giả (avatar, bio) — KHÔNG phải bảng quyền hạn |
| `settings` (file collection) | `content/settings/site.yml` | Cấu hình toàn site |

### 7.3 Điểm cần phân biệt rõ: "Editor profile" (hiển thị) vs "Identity" (quyền hạn)

Đây là quyết định kiến trúc quan trọng nhất của mục Data Model:

> **`content/editors/*.md` mãi mãi chỉ là dữ liệu hiển thị (avatar, tiểu sử, trang tác giả công khai). Nó không bao giờ được dùng để xác định quyền hạn.** Quyền hạn nằm 100% ở GitHub (Teams, repository role) — không trộn hai khái niệm này vào một bảng "users" duy nhất.

Lý do: nếu để `content/editors/*.md` vừa là hồ sơ công khai vừa là "nguồn sự thật" về quyền, bất kỳ ai có quyền sửa nội dung cũng vô tình có thể tự cấp quyền cho mình bằng cách sửa file Markdown — một lỗ hổng bảo mật cổ điển của các hệ thống "quyền hạn lưu trong content." Tách bạch triệt để hai khái niệm là cách duy nhất giữ được mô hình "không backend" mà vẫn an toàn.

Trường liên kết duy nhất giữa hai thế giới: `content/editors/*.md` có thêm 1 field mới (V2.0):

```yaml
---
name: Lamar
github_username: lamaronthebeatz   # field MỚI — chỉ để hiển thị link "Xem trên GitHub", KHÔNG dùng để check quyền
avatar: /uploads/3445.png
bio: ...
---
```

### 7.4 Trường mở rộng cho `articles` (V2.0)

Không thêm trường "status" (đã giải thích ở mục 2.3 — trạng thái suy ra từ Git). Chỉ thêm các trường thực sự cần dữ liệu mà Git không tự biểu diễn được:

| Trường mới | Kiểu | Mục đích |
|---|---|---|
| `reviewed_by` | string, optional | Tên hiển thị người duyệt cuối — **ghi chú biên tập**, tự động điền gợi ý từ người approve PR gần nhất (không bắt buộc, không phải nguồn sự thật — nguồn sự thật vẫn là lịch sử review trên GitHub) |
| `embargo_until` | string ISO date, optional | Chỉ dùng nếu triển khai scheduled publish ở tương lai (mục 6.2) — **không thêm ở Phase 1.0** nếu chưa có cơ chế cron đi kèm, tránh field "chết" |

Cố tình **không** thêm: `status`, `workflow_state`, `owner_id` — tất cả đã có sẵn trong PR/branch state của Git, thêm field trùng lặp sẽ tạo ra 2 nguồn sự thật lệch nhau theo thời gian (chính là loại lỗi "config nói một đằng, hệ thống chạy một nẻo" mà các phase trước đã phải dọn).

### 7.5 Quy mô hàng nghìn bài viết

`scripts/build.py` hiện tại load toàn bộ `content/articles/*.md` vào bộ nhớ mỗi lần build (`load_articles()`). Ở quy mô hàng nghìn file Markdown, đây vẫn là bài toán build tĩnh thông thường (tương tự Hugo/Jekyll/Eleventy ở quy mô tương đương) — không cần đổi kiến trúc, có thể cần theo dõi thời gian build của GitHub Actions và cân nhắc build tăng dần (incremental) chỉ khi thời gian build thực sự trở thành vấn đề đo được, không phải lo trước.

---

## 8. Dashboard Information Architecture

### 8.1 Nguyên tắc

**Không xây một "dashboard app" riêng.** "Dashboard" của Editorial Platform là **3 bề mặt có sẵn**, mỗi bề mặt trả lời đúng một câu hỏi:

| Bề mặt | Trả lời câu hỏi | Công cụ |
|---|---|---|
| **Hàng đợi duyệt bài** | "Bài nào đang chờ tôi duyệt?" | GitHub Pull Requests (filter theo `review-requested:@me`) |
| **Lịch biên tập** | "Tuần này có gì sắp đăng?" | GitHub Projects board (mục 5.4) |
| **Soạn thảo & trạng thái bài của tôi** | "Bài tôi đang viết, đang ở bước nào?" | Sveltia CMS Editorial Workflow view (3 cột Drafts/In Review/Ready — có sẵn, không cần code) |

### 8.2 Thông tin biên tập tổng quan (nếu cần, ở mức tối thiểu)

Nếu về sau cần một trang tổng quan kiểu "có bao nhiêu bài mỗi series, ai viết nhiều nhất tháng này" — **đây là ứng viên hợp lệ duy nhất để thêm 1 trang tĩnh mới**, sinh ra bởi chính `scripts/build.py` (giống cách `all-series.html`/`archive.html`/`all-tags.html` đã được sinh ở các phase trước), KHÔNG phải một dashboard app riêng, KHÔNG cần database:

- Trang `internal/stats.html` (không liệt kê trong sitemap, không link công khai), build từ đúng `ARTICLES`/`SERIES`/`EDITORS` đã có trong bộ nhớ lúc build — không truy vấn gì thêm.
- Bảo vệ truy cập bằng **Cloudflare Access** (zero-trust, chỉ định email/domain được phép xem) — tính năng có sẵn của Cloudflare, không cần auth backend riêng.

Đây là mục ở ranh giới "cần" — ghi nhận là **Future Expansion** (mục 12), không triển khai ngay trong Phase 1.0 vì hiện chưa có nhu cầu đo lường cụ thể nào được đặt ra.

### 8.3 Thông tin kiến trúc — cây điều hướng của "dashboard"

```
Biên tập viên đăng nhập (Sveltia CMS)
├── Bài viết của tôi
│   ├── Drafts (đang viết)
│   ├── In Review (đã gửi duyệt)
│   └── Ready (đã duyệt, chờ publish)
├── [Nếu là Senior Editor/Editor-in-Chief] → mở GitHub
│   ├── Pull Requests → "Review requested" (hàng đợi duyệt)
│   └── Projects → Editorial Calendar (lịch biên tập)
└── [Nếu là Editor-in-Chief] → Cấu hình
    ├── content/settings/site.yml (qua Sveltia CMS collection "settings")
    └── admin/config.yml, scripts/build.py (qua GitHub trực tiếp — cố tình
        KHÔNG lộ ra Sveltia CMS, vì đây là cấu hình hệ thống, không phải
        nội dung biên tập — xem mục 4, hàng CODEOWNERS)
```

---

## 9. Authentication Flow

### 9.1 Nguyên tắc

Danh tính đăng nhập luôn luôn là **tài khoản GitHub thật của từng biên tập viên** — không có tài khoản "dùng chung", không có username/password riêng của CMS. Một người có nhiều tài khoản GitHub thì có nhiều "danh tính biên tập" tương ứng — đúng bản chất của việc quyền hạn nằm ở GitHub.

### 9.2 Phương án V1.0/hiện tại — Personal Access Token (giữ nguyên, khuyến nghị cho Phase 1.0)

```
Biên tập viên → github.com/settings/tokens (tạo Fine-grained PAT,
                scope: Contents read/write, chỉ trên repo này, có hạn dùng)
             → Dán token vào Sveltia CMS ("Sign in with Token")
             → Token lưu cục bộ trong trình duyệt của người đó
             → Mọi request tới GitHub API dùng token này
             → GitHub tự áp quyền tương ứng role của tài khoản đó (mục 3)
```

**Ưu điểm:** Zero infrastructure — đúng yêu cầu "không thêm backend." Đã chứng minh hoạt động (đây chính là cơ chế đang chạy thật trên site hôm nay).
**Nhược điểm ở quy mô nhiều người:** mỗi biên tập viên phải tự tạo token, tự nhớ gia hạn — chấp nhận được ở quy mô vài người, trở nên phiền khi có hàng chục cộng tác viên (ghi nhận ở mục 12).

### 9.3 Sơ đồ luồng đăng nhập (áp dụng cho mọi vai trò)

```
┌──────────┐   1. Mở /admin/       ┌───────────────┐
│ Trình    │──────────────────────▶│ Sveltia CMS   │
│ duyệt    │                       │ (admin/       │
│ biên tập │◀──────────────────────│  index.html)  │
│ viên     │  2. Yêu cầu đăng nhập │               │
└────┬─────┘                       └───────────────┘
     │ 3. Dán PAT (đã tạo sẵn từ GitHub Settings)
     ▼
┌──────────────────────────────────────────────┐
│ GitHub REST/GraphQL API                       │
│ - Xác thực token                              │
│ - Trả về quyền thật của tài khoản trên repo   │
└──────────────────────────────────────────────┘
     │ 4. Token hợp lệ + có quyền Contents
     ▼
Sveltia CMS hiển thị đúng collection/entry mà
quyền GitHub của người đó cho phép thao tác
```

Không có bước nào đi qua một server trung gian do TNC vận hành — **đây chính là lý do hệ thống này "không có backend."**

### 9.4 Có nên nâng cấp sang GitHub OAuth App?

Có một phương án thay thế PAT phổ biến hơn (đăng nhập bằng nút "Sign in with GitHub" thay vì dán token thủ công) — nhưng phương án này **cần một OAuth token-exchange proxy** (thường là 1 Cloudflare Worker nhỏ). Vì yêu cầu Phase 1.0 là **KHÔNG tạo backend**, phương án OAuth App bị hoãn sang mục 12 (Future Expansion), dù về bản chất một Worker "chỉ để đổi code lấy token" gần như không phải là backend theo nghĩa truyền thống (không state, không logic nghiệp vụ) — vẫn tôn trọng nghiêm ngặt yêu cầu của Phase 1.0 bằng cách không đưa vào kiến trúc lõi ngay bây giờ.

---

## 10. API Boundary

### 10.1 Không có API nào do The New Culture vận hành

Đây là phát biểu kiến trúc quan trọng nhất của mục này: **Editorial Platform V2.0 không mở, không cần, và không nên có một API server nào của riêng nó** ở Phase 1.0. Mọi "API" trong hệ thống đều là API của bên thứ ba mà site chỉ là client:

| API | Ai vận hành | Ai gọi | Mục đích |
|---|---|---|---|
| GitHub REST/GraphQL + Git Data API | GitHub | Sveltia CMS (trình duyệt) | Đọc/ghi nội dung, review PR, quản lý quyền |
| GitHub Actions webhook nội bộ | GitHub | GitHub (tự động) | Kích hoạt build khi có push vào `main` |
| Cloudflare Pages Deploy API | Cloudflare | GitHub Actions/Cloudflare (tự động) | Deploy `public/` |
| Cloudflare Web Analytics beacon | Cloudflare | Trình duyệt độc giả | Đo lượt truy cập (đã tích hợp, đọc-only, không phải API do site vận hành) |

### 10.2 Ranh giới cứng — điều gì SẼ cần một API thật

Ghi nhận rõ để không âm thầm "trôi" vào việc xây backend mà không nhận ra: nếu Version tương lai cần bất kỳ điều nào dưới đây, đó là tín hiệu **bắt buộc** phải thảo luận lại kiến trúc (không còn nằm trong phạm vi "chỉ cấu hình lại hệ thống có sẵn"):

- Bình luận độc giả (cần lưu trữ + kiểm duyệt nội dung do người ngoài gửi).
- Đăng ký newsletter thật (cần lưu email, chống spam) — hiện tại form `newsletter.html` chỉ là form tĩnh, chưa có nơi nhận dữ liệu thật.
- Cá nhân hóa nội dung theo người dùng đã đăng nhập (không phải biên tập viên).
- Tìm kiếm full-text ở quy mô không còn tải nổi trong `search-index.json` phía client.

Không cái nào trong số này thuộc phạm vi Phase 1.0.

---

## 11. Cloudflare Architecture

### 11.1 Hiện có (không đổi)

```
Cloudflare Pages
├── Production deployment ← branch: main
│   └── Build output directory: public
├── Cloudflare Web Analytics (đã tích hợp qua content/settings/site.yml)
└── DNS (thenewculture.pages.dev, hoặc domain riêng nếu có)
```

### 11.2 Thêm ở Version 2.0 (đều là tính năng có sẵn của Cloudflare, chỉ cần bật/cấu hình — không phải xây mới)

| Tính năng Cloudflare | Dùng để làm gì trong Editorial Platform | Trạng thái |
|---|---|---|
| **Preview Deployments** | Mỗi PR (mỗi bài đang chờ duyệt) có 1 URL xem trước riêng, tự động | Bật trong Cloudflare Pages project settings — không cần thay đổi `scripts/build.py` |
| **Cloudflare Access** | Bảo vệ trang nội bộ (`internal/stats.html` nếu triển khai — mục 8.2) sau một lớp xác thực email/domain, không cần app riêng | Chỉ cấu hình khi mục 8.2 thực sự được triển khai |
| **Build cache** | Rút ngắn thời gian build khi kho bài viết lớn dần | Mặc định của Cloudflare Pages, không cần cấu hình thêm ở quy mô hiện tại |

### 11.3 Không thêm

- Không thêm **Cloudflare Workers** làm logic nghiệp vụ (chỉ cân nhắc 1 Worker cực nhỏ cho OAuth proxy — mục 9.4 — và chỉ khi thật sự nâng cấp auth).
- Không thêm **Cloudflare D1/KV/R2** làm nơi lưu dữ liệu ứng dụng — toàn bộ dữ liệu vẫn ở GitHub. (R2/KV có thể hợp lý cho lưu ảnh upload ở quy mô rất lớn về sau, nhưng hiện `public/uploads/` qua Git vẫn đủ dùng và giữ đúng nguyên tắc "một nguồn sự thật".)

---

## 12. Future Expansion

Liệt kê để không quên, **không cam kết triển khai trong Phase 1.0** — chỉ triển khai khi có nhu cầu đo lường được, đúng tinh thần "không over-engineer":

| Hạng mục | Khi nào nên làm | Vẫn không cần backend mới? |
|---|---|---|
| GitHub OAuth App thay cho Personal Access Token | Khi số cộng tác viên đủ lớn để việc tự quản lý PAT trở thành điểm nghẽn | Cần 1 Cloudflare Worker nhỏ làm token-exchange proxy — biên giới mờ nhất của "không backend", cần quyết định rõ khi tới lúc |
| Scheduled publish qua GitHub Actions cron | Khi tần suất xuất bản cần khớp khung giờ cố định | Có — chỉ thêm 1 workflow file |
| Trang thống kê biên tập nội bộ (`internal/stats.html`) | Khi cần nhìn số liệu tổng quan thường xuyên hơn là hỏi trực tiếp trên GitHub | Có — build tĩnh, bảo vệ bằng Cloudflare Access |
| Nâng cấp search sang chỉ mục tĩnh chuyên dụng (ví dụ Pagefind) | Khi `search-index.json` quá lớn để tải mượt phía client | Có — vẫn là công cụ build-time, không cần server tìm kiếm |
| Newsletter thật (không chỉ form tĩnh) | Khi thực sự cần thu thập email | Cần dịch vụ bên thứ ba (ví dụ Cloudflare Email Workers, hoặc ESP có sẵn) — KHÔNG tự xây |
| Bình luận độc giả | Khi có nhu cầu tương tác cộng đồng rõ ràng | Cần dịch vụ bên thứ ba (ví dụ giaComments qua GitHub Discussions) — KHÔNG tự xây backend kiểm duyệt |
| i18n (đa ngôn ngữ) | Khi mở rộng ra ngoài tiếng Việt | Không — mở rộng cấu trúc `content/` + `scripts/build.py`, vẫn static |

---

## Tóm tắt cho người quyết định

Version 2.0 không phải một hệ thống mới. Nó là **5 thay đổi cấu hình** lên đúng 4 khối đã có (GitHub, Sveltia CMS, `scripts/build.py`/Actions, Cloudflare Pages):

1. Bật `publish_mode: editorial_workflow` trong `admin/config.yml`.
2. Bật branch protection + required review trên `main`.
3. Thêm file `CODEOWNERS` cho các file cấu hình hệ thống.
4. Mời cộng tác viên vào repo với đúng GitHub role theo mục 3.
5. Bật Cloudflare Pages Preview Deployments.

Không dòng code ứng dụng nào được viết. Không server nào được dựng lên. Đây là toàn bộ "hạ tầng" cần cho một tòa soạn nhiều người, hàng nghìn bài viết — chạy trên đúng nền tảng miễn phí đang dùng hôm nay.
